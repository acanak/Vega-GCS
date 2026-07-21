import Foundation
import Capacitor
import Network
import CoreBluetooth

/**
 * Vega GCS native taşıyıcılar (iOS): UDP / TCP / BLE (NUS).
 * USB seri iOS'ta yoktur (platform kısıtı) — usb* metodları açık hata döndürür.
 *
 * Dayanıklılık ilkeleri Android tarafıyla aynı: id→bağlantı haritası, hata =
 * 'closed' olayı, idempotent close, tüm kaynaklar her yolda serbest bırakılır.
 */
@objc(VegaNativeLinkPlugin)
public class VegaNativeLinkPlugin: CAPPlugin {

    private var conns: [String: VNLConn] = [:]
    private var nextId: Int = 1
    private let lock = NSLock()
    private var ble: BleCentral?

    private func newId(_ prefix: String) -> String {
        lock.lock(); defer { lock.unlock() }
        let id = "\(prefix)-\(nextId)"; nextId += 1
        return id
    }

    func put(_ id: String, _ c: VNLConn) { lock.lock(); conns[id] = c; lock.unlock() }
    func get(_ id: String) -> VNLConn? { lock.lock(); defer { lock.unlock() }; return conns[id] }
    func take(_ id: String) -> VNLConn? { lock.lock(); defer { lock.unlock() }; return conns.removeValue(forKey: id) }

    func emitData(_ id: String, _ data: Data) {
        notifyListeners("data", data: ["id": id, "data": data.base64EncodedString()])
    }
    func emitDatagram(_ id: String, _ data: Data, _ host: String, _ port: Int) {
        notifyListeners("datagram", data: ["id": id, "data": data.base64EncodedString(), "host": host, "port": port])
    }
    func emitClosed(_ id: String, _ error: String?) {
        guard take(id) != nil else { return } // yalnız ilk kapanış yayılır
        var ev: [String: Any] = ["id": id]
        if let e = error { ev["error"] = e }
        notifyListeners("closed", data: ev)
    }

    // ------------------------------------------------------------------ UDP

    @objc func udpBind(_ call: CAPPluginCall) {
        let localPort = call.getInt("localPort") ?? 14550
        let id = newId("udp")
        do {
            let conn = try UdpConn(port: UInt16(localPort),
                                   onDatagram: { [weak self] d, h, p in self?.emitDatagram(id, d, h, p) },
                                   onClosed: { [weak self] err in self?.emitClosed(id, err) })
            put(id, conn)
            call.resolve(["id": id])
        } catch {
            call.reject("UDP bağlanamadı :\(localPort) — \(error.localizedDescription)")
        }
    }

    @objc func udpSend(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let host = call.getString("host"),
              let port = call.getInt("port"), let b64 = call.getString("data"),
              let data = Data(base64Encoded: b64) else { return call.reject("parametre eksik") }
        guard let conn = get(id) as? UdpConn else { return call.reject("bağlantı yok: \(id)") }
        conn.sendTo(data, host: host, port: UInt16(port)) { err in
            if let e = err { call.reject("gönderilemedi: \(e)") } else { call.resolve() }
        }
    }

    // ------------------------------------------------------------------ TCP

    @objc func tcpConnect(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), let port = call.getInt("port") else { return call.reject("host/port eksik") }
        let id = newId("tcp")
        let conn = TcpConn(host: host, port: UInt16(port),
                           onData: { [weak self] d in self?.emitData(id, d) },
                           onClosed: { [weak self] err in self?.emitClosed(id, err) },
                           onReady: { [weak self] err in
                               if let e = err { _ = self?.take(id); call.reject("TCP bağlanamadı \(host):\(port) — \(e)") }
                               else { call.resolve(["id": id]) }
                           })
        put(id, conn) // onClosed olayları bağlanma sırasında da eşleşsin diye önce kaydet
        conn.start()
    }

    @objc func tcpSend(_ call: CAPPluginCall) { streamSend(call) }

    // ------------------------------------------------------------ USB (yok)

    @objc func usbList(_ call: CAPPluginCall) { call.resolve(["devices": []]) }
    @objc func usbOpen(_ call: CAPPluginCall) { call.reject("iOS'ta USB seri erişimi yok — UDP/BLE telemetri köprüsü kullanın (PLAN-MOBILE.md)") }
    @objc func usbSend(_ call: CAPPluginCall) { call.reject("iOS'ta USB seri erişimi yok") }

    // ---------------------------------------------------------------- BLE

    @objc func bleScan(_ call: CAPPluginCall) {
        let timeoutMs = call.getInt("timeoutMs") ?? 5000
        if ble == nil { ble = BleCentral() }
        ble!.scan(timeoutMs: timeoutMs) { devices in
            call.resolve(["devices": devices])
        }
    }

    @objc func bleConnect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else { return call.reject("deviceId eksik") }
        if ble == nil { ble = BleCentral() }
        let id = newId("ble")
        ble!.connect(deviceId: deviceId,
                     onData: { [weak self] d in self?.emitData(id, d) },
                     onClosed: { [weak self] err in self?.emitClosed(id, err) }) { [weak self] conn, err in
            if let e = err { call.reject(e); return }
            self?.put(id, conn!)
            call.resolve(["id": id])
        }
    }

    @objc func bleSend(_ call: CAPPluginCall) { streamSend(call) }

    // ------------------------------------------------------------- ortak

    private func streamSend(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let b64 = call.getString("data"),
              let data = Data(base64Encoded: b64) else { return call.reject("parametre eksik") }
        guard let conn = get(id) else { return call.reject("bağlantı yok: \(id)") }
        conn.send(data) { [weak self] err in
            if let e = err {
                call.reject("gönderilemedi: \(e)")
                self?.emitClosed(id, e)
                conn.close()
            } else { call.resolve() }
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("id eksik") }
        take(id)?.close()
        call.resolve()
    }
}
