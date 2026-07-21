import Foundation
import Network
import CoreBluetooth

// Bağlantı sınıfları: UDP (POSIX soket — eş öğrenme semantiği için tam kontrol),
// TCP (Network.framework), BLE merkez (CoreBluetooth, Nordic UART Service).

public protocol VNLConn {
    func send(_ data: Data, completion: @escaping (String?) -> Void)
    func close()
}

// ------------------------------------------------------------------- UDP

/// POSIX UDP soketi: herhangi bir kaynaktan al (recvfrom), hedefe gönder (sendto).
final class UdpConn: VNLConn {
    private let fd: Int32
    private let queue = DispatchQueue(label: "vnl.udp.rx")
    private let sendQueue = DispatchQueue(label: "vnl.udp.tx")
    private var running = true
    private let onClosed: (String?) -> Void

    init(port: UInt16, onDatagram: @escaping (Data, String, Int) -> Void, onClosed: @escaping (String?) -> Void) throws {
        self.onClosed = onClosed
        fd = socket(AF_INET, SOCK_DGRAM, 0)
        guard fd >= 0 else { throw NSError(domain: "vnl", code: 1, userInfo: [NSLocalizedDescriptionKey: "soket oluşturulamadı"]) }
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = INADDR_ANY
        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0 else {
            Darwin.close(fd)
            throw NSError(domain: "vnl", code: 2, userInfo: [NSLocalizedDescriptionKey: "port bağlanamadı :\(port)"])
        }
        queue.async { [weak self] in
            var buf = [UInt8](repeating: 0, count: 65535)
            while self?.running == true {
                var from = sockaddr_in()
                var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
                let n = withUnsafeMutablePointer(to: &from) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { fp in
                        recvfrom(self?.fd ?? -1, &buf, buf.count, 0, fp, &fromLen)
                    }
                }
                guard let self = self, self.running else { break }
                if n > 0 {
                    let host = String(cString: inet_ntoa(from.sin_addr))
                    let port = Int(UInt16(bigEndian: from.sin_port))
                    onDatagram(Data(buf[0..<n]), host, port)
                } else if n < 0 {
                    self.running = false
                    onClosed("UDP okuma hatası (errno \(errno))")
                    break
                }
            }
        }
    }

    func sendTo(_ data: Data, host: String, port: UInt16, completion: @escaping (String?) -> Void) {
        sendQueue.async { [fd] in
            var addr = sockaddr_in()
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = port.bigEndian
            guard inet_pton(AF_INET, host, &addr.sin_addr) == 1 else { return completion("geçersiz adres: \(host)") }
            let sent = data.withUnsafeBytes { raw in
                withUnsafePointer(to: &addr) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { ap in
                        sendto(fd, raw.baseAddress, data.count, 0, ap, socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }
            }
            completion(sent == data.count ? nil : "sendto başarısız (errno \(errno))")
        }
    }

    func send(_ data: Data, completion: @escaping (String?) -> Void) {
        completion("UDP'de hedefli gönderim kullanılır (udpSend)")
    }

    func close() {
        running = false
        Darwin.close(fd) // recvfrom'u uyandırır
    }
}

// ------------------------------------------------------------------- TCP

final class TcpConn: VNLConn {
    private let conn: NWConnection
    private let onData: (Data) -> Void
    private let onClosed: (String?) -> Void
    private var readyReported = false

    init(host: String, port: UInt16,
         onData: @escaping (Data) -> Void,
         onClosed: @escaping (String?) -> Void,
         onReady: @escaping (String?) -> Void) {
        self.onData = onData
        self.onClosed = onClosed
        let params = NWParameters.tcp
        (params.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options)?.noDelay = true
        conn = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!, using: params)
        conn.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                if self?.readyReported == false { self?.readyReported = true; onReady(nil) }
                self?.receiveLoop()
            case .failed(let err):
                if self?.readyReported == false { self?.readyReported = true; onReady(err.localizedDescription) }
                else { self?.onClosed(err.localizedDescription) }
            case .cancelled:
                self?.onClosed(nil)
            default: break
            }
        }
    }

    func start() { conn.start(queue: DispatchQueue(label: "vnl.tcp")) }

    private func receiveLoop() {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, err in
            if let d = data, !d.isEmpty { self?.onData(d) }
            if let e = err { self?.onClosed(e.localizedDescription); return }
            if isComplete { self?.onClosed(nil); return } // karşı taraf kapattı
            self?.receiveLoop()
        }
    }

    func send(_ data: Data, completion: @escaping (String?) -> Void) {
        conn.send(content: data, completion: .contentProcessed { err in completion(err?.localizedDescription) })
    }

    func close() { conn.cancel() }
}

// ------------------------------------------------------------------- BLE

private let nusService = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
private let nusRx = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // yazma (GCS→araç)
private let nusTx = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // bildirim (araç→GCS)

final class BleConn: VNLConn {
    weak var peripheral: CBPeripheral?
    weak var central: CBCentralManager?
    var rxChar: CBCharacteristic?

    func send(_ data: Data, completion: @escaping (String?) -> Void) {
        guard let p = peripheral, let c = rxChar else { return completion("BLE hazır değil") }
        // MTU parçalama: uzun MAVLink çerçeveleri bölünür
        let chunk = p.maximumWriteValueLength(for: .withoutResponse)
        var off = 0
        while off < data.count {
            let end = min(off + chunk, data.count)
            p.writeValue(data.subdata(in: off..<end), for: c, type: .withoutResponse)
            off = end
        }
        completion(nil)
    }

    func close() {
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
    }
}

/// CoreBluetooth merkez: NUS tarama + bağlanma. Tek aktif bağlantı varsayımı
/// (telemetri köprüsü senaryosu); çoklu bağlantı gerekirse harita eklenir.
final class BleCentral: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var central: CBCentralManager!
    private var found: [String: (peripheral: CBPeripheral, name: String, rssi: Int)] = [:]
    private var scanDone: (([[String: Any]]) -> Void)?
    private var connectDone: ((VNLConn?, String?) -> Void)?
    private var onData: ((Data) -> Void)?
    private var onClosed: ((String?) -> Void)?
    private var activeConn: BleConn?
    private var pendingScanTimeout: Int = 5000
    private var poweredOn = false

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: DispatchQueue(label: "vnl.ble"))
    }

    func scan(timeoutMs: Int, done: @escaping ([[String: Any]]) -> Void) {
        scanDone = done
        pendingScanTimeout = timeoutMs
        if poweredOn { startScan() } // değilse centralManagerDidUpdateState tetikler
    }

    private func startScan() {
        found.removeAll()
        central.scanForPeripherals(withServices: [nusService], options: nil)
        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(pendingScanTimeout)) { [weak self] in
            guard let self = self else { return }
            self.central.stopScan()
            let list = self.found.values
                .sorted { $0.rssi > $1.rssi }
                .map { ["deviceId": $0.peripheral.identifier.uuidString, "name": $0.name, "rssi": $0.rssi] as [String: Any] }
            self.scanDone?(list)
            self.scanDone = nil
        }
    }

    func connect(deviceId: String,
                 onData: @escaping (Data) -> Void,
                 onClosed: @escaping (String?) -> Void,
                 done: @escaping (VNLConn?, String?) -> Void) {
        guard let uuid = UUID(uuidString: deviceId),
              let peripheral = central.retrievePeripherals(withIdentifiers: [uuid]).first ?? found[deviceId]?.peripheral else {
            return done(nil, "BLE aygıt bulunamadı: \(deviceId) — önce tarayın")
        }
        self.onData = onData
        self.onClosed = onClosed
        self.connectDone = done
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    // --- CBCentralManagerDelegate ---
    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        poweredOn = c.state == .poweredOn
        if poweredOn, scanDone != nil { startScan() }
        if !poweredOn, let done = scanDone { done([]); scanDone = nil }
    }
    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
        let name = p.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        found[p.identifier.uuidString] = (p, name, rssi.intValue)
    }
    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        p.discoverServices([nusService])
    }
    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        connectDone?(nil, error?.localizedDescription ?? "bağlanamadı"); connectDone = nil
    }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        onClosed?(error?.localizedDescription)
        activeConn = nil
    }

    // --- CBPeripheralDelegate ---
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard let svc = p.services?.first(where: { $0.uuid == nusService }) else {
            connectDone?(nil, "NUS servisi yok — bu aygıt telemetri köprüsü değil"); connectDone = nil
            central.cancelPeripheralConnection(p)
            return
        }
        p.discoverCharacteristics([nusRx, nusTx], for: svc)
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        let rx = service.characteristics?.first { $0.uuid == nusRx }
        let tx = service.characteristics?.first { $0.uuid == nusTx }
        guard let rxc = rx, let txc = tx else {
            connectDone?(nil, "NUS karakteristikleri eksik"); connectDone = nil
            central.cancelPeripheralConnection(p)
            return
        }
        let conn = BleConn()
        conn.peripheral = p
        conn.central = central
        conn.rxChar = rxc
        activeConn = conn
        p.setNotifyValue(true, for: txc)
        connectDone?(conn, nil); connectDone = nil
    }
    func peripheral(_ p: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic.uuid == nusTx, let d = characteristic.value { onData?(d) }
    }
}
