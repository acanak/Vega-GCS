#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor plugin kaydı: JS tarafındaki metod imzalarıyla birebir eşleşir.
CAP_PLUGIN(VegaNativeLinkPlugin, "VegaNativeLink",
  CAP_PLUGIN_METHOD(udpBind, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(udpSend, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(tcpConnect, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(tcpSend, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(usbList, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(usbOpen, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(usbSend, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(bleScan, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(bleConnect, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(bleSend, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(close, CAPPluginReturnPromise);
)
