package com.vega.gcs.link

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Vega GCS native taşıyıcılar (Android): UDP / TCP / USB seri (OTG) / BLE (NUS).
 *
 * Tasarım ilkeleri (dayanıklılık):
 *  - Her bağlantı bir Conn nesnesi; id ile ConcurrentHashMap'te tutulur.
 *  - Okuma döngüleri arka plan thread'lerinde; hata = 'closed' olayı (asla sessiz ölüm yok).
 *  - close() idempotent; kaynaklar (thread/soket/gatt) her yolda serbest bırakılır.
 *  - JS'e olaylar: 'data' {id,data}, 'datagram' {id,data,host,port}, 'closed' {id,error?}.
 */
@CapacitorPlugin(
    name = "VegaNativeLink",
    permissions = [
        Permission(strings = ["android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"], alias = "bluetooth"),
    ],
)
class VegaNativeLinkPlugin : Plugin() {

    private interface Conn {
        fun send(data: ByteArray)
        fun close()
    }

    private val conns = ConcurrentHashMap<String, Conn>()
    private val nextId = AtomicLong(1)
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun newId(prefix: String) = prefix + "-" + nextId.getAndIncrement()

    private fun emitData(id: String, data: ByteArray) {
        val ev = JSObject()
        ev.put("id", id)
        ev.put("data", Base64.encodeToString(data, Base64.NO_WRAP))
        notifyListeners("data", ev)
    }

    private fun emitDatagram(id: String, data: ByteArray, host: String, port: Int) {
        val ev = JSObject()
        ev.put("id", id)
        ev.put("data", Base64.encodeToString(data, Base64.NO_WRAP))
        ev.put("host", host)
        ev.put("port", port)
        notifyListeners("datagram", ev)
    }

    private fun emitClosed(id: String, error: String?) {
        conns.remove(id) ?: return // yalnız ilk kapanış yayılır (idempotent)
        val ev = JSObject()
        ev.put("id", id)
        if (error != null) ev.put("error", error)
        notifyListeners("closed", ev)
    }

    private fun decode(call: PluginCall): ByteArray? {
        val b64 = call.getString("data") ?: run { call.reject("data eksik"); return null }
        return try { Base64.decode(b64, Base64.NO_WRAP) } catch (e: Exception) { call.reject("geçersiz base64"); null }
    }

    override fun handleOnDestroy() {
        for ((id, c) in conns) { try { c.close() } catch (_: Exception) {} }
        conns.clear()
        super.handleOnDestroy()
    }

    // ------------------------------------------------------------------ UDP

    private inner class UdpConn(val id: String, localPort: Int) : Conn {
        private val socket = DatagramSocket(null).apply {
            reuseAddress = true
            bind(InetSocketAddress(localPort))
        }
        @Volatile private var running = true
        private val thread = Thread({
            val buf = ByteArray(65535)
            try {
                while (running) {
                    val pkt = DatagramPacket(buf, buf.size)
                    socket.receive(pkt)
                    emitDatagram(id, pkt.data.copyOfRange(0, pkt.length), pkt.address.hostAddress ?: "", pkt.port)
                }
            } catch (e: Exception) {
                if (running) emitClosed(id, e.message ?: "UDP soket hatası")
            }
        }, "udp-rx-$id").apply { isDaemon = true; start() }

        fun sendTo(data: ByteArray, host: String, port: Int) {
            socket.send(DatagramPacket(data, data.size, InetAddress.getByName(host), port))
        }

        override fun send(data: ByteArray) { /* UDP'de hedefli gönderim kullanılır (udpSend) */ }
        override fun close() {
            running = false
            try { socket.close() } catch (_: Exception) {}
            try { thread.join(500) } catch (_: Exception) {}
        }
    }

    @PluginMethod
    fun udpBind(call: PluginCall) {
        val localPort = call.getInt("localPort") ?: 14550
        try {
            val id = newId("udp")
            conns[id] = UdpConn(id, localPort)
            val ret = JSObject(); ret.put("id", id); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("UDP bağlanamadı :$localPort — ${e.message}")
        }
    }

    @PluginMethod
    fun udpSend(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id eksik")
        val host = call.getString("host") ?: return call.reject("host eksik")
        val port = call.getInt("port") ?: return call.reject("port eksik")
        val data = decode(call) ?: return
        val conn = conns[id] as? UdpConn ?: return call.reject("bağlantı yok: $id")
        Thread {
            try { conn.sendTo(data, host, port); call.resolve() }
            catch (e: Exception) { call.reject("gönderilemedi: ${e.message}") }
        }.start()
    }

    // ------------------------------------------------------------------ TCP

    private inner class TcpConn(val id: String, host: String, port: Int) : Conn {
        private val socket = Socket().apply { connect(InetSocketAddress(host, port), 5000); tcpNoDelay = true }
        @Volatile private var running = true
        private val out = socket.getOutputStream()
        private val thread = Thread({
            val buf = ByteArray(16384)
            try {
                val input = socket.getInputStream()
                while (running) {
                    val n = input.read(buf)
                    if (n < 0) break
                    if (n > 0) emitData(id, buf.copyOfRange(0, n))
                }
                if (running) emitClosed(id, null) // karşı taraf kapattı
            } catch (e: Exception) {
                if (running) emitClosed(id, e.message ?: "TCP okuma hatası")
            }
        }, "tcp-rx-$id").apply { isDaemon = true; start() }

        override fun send(data: ByteArray) { out.write(data); out.flush() }
        override fun close() {
            running = false
            try { socket.close() } catch (_: Exception) {}
            try { thread.join(500) } catch (_: Exception) {}
        }
    }

    @PluginMethod
    fun tcpConnect(call: PluginCall) {
        val host = call.getString("host") ?: return call.reject("host eksik")
        val port = call.getInt("port") ?: return call.reject("port eksik")
        Thread {
            try {
                val id = newId("tcp")
                conns[id] = TcpConn(id, host, port)
                val ret = JSObject(); ret.put("id", id); call.resolve(ret)
            } catch (e: Exception) {
                call.reject("TCP bağlanamadı $host:$port — ${e.message}")
            }
        }.start()
    }

    @PluginMethod
    fun tcpSend(call: PluginCall) = streamSend(call)

    // ------------------------------------------------------------ USB seri

    private inner class UsbConn(val id: String, private val port: UsbSerialPort) : Conn, SerialInputOutputManager.Listener {
        private val ioManager = SerialInputOutputManager(port, this).apply { start() }
        override fun onNewData(data: ByteArray) = emitData(id, data)
        override fun onRunError(e: Exception) = emitClosed(id, e.message ?: "USB seri hatası")
        override fun send(data: ByteArray) { port.write(data, 2000) }
        override fun close() {
            try { ioManager.stop() } catch (_: Exception) {}
            try { port.close() } catch (_: Exception) {}
        }
    }

    @PluginMethod
    fun usbList(call: PluginCall) {
        val usb = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usb)
        val arr = com.getcapacitor.JSArray()
        for (d in drivers) {
            val o = JSObject()
            o.put("deviceId", d.device.deviceId)
            o.put("name", d.device.productName ?: d.device.deviceName)
            o.put("vid", d.device.vendorId)
            o.put("pid", d.device.productId)
            o.put("driver", d.javaClass.simpleName)
            arr.put(o)
        }
        val ret = JSObject(); ret.put("devices", arr); call.resolve(ret)
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag", "MutableImplicitPendingIntent")
    @PluginMethod
    fun usbOpen(call: PluginCall) {
        val deviceId = call.getInt("deviceId") ?: return call.reject("deviceId eksik")
        val baud = call.getInt("baud") ?: 115200
        val usb = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val driver = UsbSerialProber.getDefaultProber().findAllDrivers(usb).firstOrNull { it.device.deviceId == deviceId }
            ?: return call.reject("USB aygıt bulunamadı: $deviceId")

        fun openPort() {
            try {
                val connection = usb.openDevice(driver.device) ?: throw Exception("aygıt açılamadı (izin?)")
                val port = driver.ports[0]
                port.open(connection)
                port.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
                port.dtr = true // Pixhawk USB CDC: DTR olmadan veri akmaz
                val id = newId("usb")
                conns[id] = UsbConn(id, port)
                val ret = JSObject(); ret.put("id", id); call.resolve(ret)
            } catch (e: Exception) {
                call.reject("USB açılamadı: ${e.message}")
            }
        }

        if (usb.hasPermission(driver.device)) { openPort(); return }

        // İzin akışı: sistem diyaloğu → BroadcastReceiver → aç
        val action = "com.vega.gcs.link.USB_PERMISSION." + deviceId
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                context.unregisterReceiver(this)
                if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) openPort()
                else call.reject("USB izni reddedildi")
            }
        }
        val flags = if (Build.VERSION.SDK_INT >= 34) Context.RECEIVER_NOT_EXPORTED else 0
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, IntentFilter(action), flags)
        else @Suppress("DEPRECATION") context.registerReceiver(receiver, IntentFilter(action))
        val piFlags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        usb.requestPermission(driver.device, PendingIntent.getBroadcast(context, 0, Intent(action).setPackage(context.packageName), piFlags))
    }

    @PluginMethod
    fun usbSend(call: PluginCall) = streamSend(call)

    // ---------------------------------------------------------------- BLE

    private val NUS_SERVICE: UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
    private val NUS_RX: UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e") // yazma (GCS→araç)
    private val NUS_TX: UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e") // bildirim (araç→GCS)
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private fun adapter(): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun bleScan(call: PluginCall) {
        val timeoutMs = call.getInt("timeoutMs") ?: 5000
        val scanner = adapter()?.bluetoothLeScanner ?: return call.reject("Bluetooth kapalı ya da yok")
        val found = ConcurrentHashMap<String, JSObject>()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val o = JSObject()
                o.put("deviceId", result.device.address)
                o.put("name", result.device.name ?: result.scanRecord?.deviceName ?: "")
                o.put("rssi", result.rssi)
                found[result.device.address] = o
            }
        }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(NUS_SERVICE)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner.startScan(listOf(filter), settings, cb)
        mainHandler.postDelayed({
            try { scanner.stopScan(cb) } catch (_: Exception) {}
            val arr = com.getcapacitor.JSArray()
            found.values.sortedByDescending { it.getInteger("rssi") ?: -127 }.forEach { arr.put(it) }
            val ret = JSObject(); ret.put("devices", arr); call.resolve(ret)
        }, timeoutMs.toLong())
    }

    @SuppressLint("MissingPermission")
    private inner class BleConn(val id: String) : Conn {
        var gatt: BluetoothGatt? = null
        var rxChar: BluetoothGattCharacteristic? = null
        var mtu = 23

        override fun send(data: ByteArray) {
            val g = gatt ?: throw Exception("GATT yok")
            val c = rxChar ?: throw Exception("NUS RX yok")
            // MTU-3 parçalama: uzun MAVLink çerçeveleri bölünür (BLE payload sınırı)
            var off = 0
            val chunk = mtu - 3
            while (off < data.size) {
                val end = minOf(off + chunk, data.size)
                c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                @Suppress("DEPRECATION") c.value = data.copyOfRange(off, end)
                @Suppress("DEPRECATION") g.writeCharacteristic(c)
                off = end
            }
        }

        override fun close() {
            try { gatt?.disconnect(); gatt?.close() } catch (_: Exception) {}
            gatt = null
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun bleConnect(call: PluginCall) {
        val deviceId = call.getString("deviceId") ?: return call.reject("deviceId eksik")
        val dev = try { adapter()?.getRemoteDevice(deviceId) } catch (e: Exception) { null }
            ?: return call.reject("BLE aygıt bulunamadı: $deviceId")
        val id = newId("ble")
        val conn = BleConn(id)
        var resolved = false

        val cb = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) { g.requestMtu(247) }
                else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    if (!resolved) { resolved = true; call.reject("BLE bağlantısı koptu (status=$status)") }
                    emitClosed(id, if (status == 0) null else "GATT status $status")
                    conn.close()
                }
            }
            override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
                conn.mtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23
                g.discoverServices()
            }
            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                val svc = g.getService(NUS_SERVICE)
                val tx = svc?.getCharacteristic(NUS_TX)
                val rx = svc?.getCharacteristic(NUS_RX)
                if (svc == null || tx == null || rx == null) {
                    if (!resolved) { resolved = true; call.reject("NUS servisi yok — bu aygıt telemetri köprüsü değil") }
                    conn.close(); conns.remove(id); return
                }
                conn.rxChar = rx
                g.setCharacteristicNotification(tx, true)
                val d = tx.getDescriptor(CCCD)
                @Suppress("DEPRECATION") d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION") g.writeDescriptor(d)
            }
            override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
                if (!resolved) {
                    resolved = true
                    conns[id] = conn
                    val ret = JSObject(); ret.put("id", id); call.resolve(ret)
                }
            }
            @Suppress("DEPRECATION")
            override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
                if (c.uuid == NUS_TX) emitData(id, c.value)
            }
        }
        conn.gatt = dev.connectGatt(context, false, cb)
    }

    @PluginMethod
    fun bleSend(call: PluginCall) = streamSend(call)

    // ------------------------------------------------------------- ortak

    private fun streamSend(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id eksik")
        val data = decode(call) ?: return
        val conn = conns[id] ?: return call.reject("bağlantı yok: $id")
        Thread {
            try { conn.send(data); call.resolve() }
            catch (e: Exception) {
                call.reject("gönderilemedi: ${e.message}")
                emitClosed(id, e.message)
                try { conn.close() } catch (_: Exception) {}
            }
        }.start()
    }

    @PluginMethod
    fun close(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id eksik")
        val conn = conns.remove(id)
        if (conn != null) { try { conn.close() } catch (_: Exception) {} }
        call.resolve()
    }
}
