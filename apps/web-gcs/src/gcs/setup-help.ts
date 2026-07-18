// Setup bölümleri için sayfa-özel yardım (ne + neden + nasıl). Kısa ve öğretici.
// i18n dosyalarını şişirmemek için burada tutulur; SetupView geçerli dile göre gösterir.
export interface HelpEntry { title: string; body: string; tips: string[] }
type Lang = 'tr' | 'en' | 'de';

export const SETUP_HELP: Record<string, Record<Lang, HelpEntry>> = {
  firmware: {
    tr: { title: 'Firmware', body: 'Uçuş kontrolcüsüne ArduPilot yazılımını yükler ya da yükseltir. Karta seri bootloader (USB) veya DFU ile yazabilir, ya da ArduPilot sürümünü doğrudan indirebilirsiniz.', tips: ['Kartı bootloader modunda USB’ye bağlayın (Chromium/Edge).', 'Tam kart modelinizi seçin — yanlış firmware kartı çalışmaz hale getirir.', '.apj kart uyumunu kontrol eder; ham .bin etmez.'] },
    en: { title: 'Firmware', body: 'Installs or upgrades the ArduPilot software on the flight controller. Flash over the serial bootloader (USB) or DFU, or download a version straight from ArduPilot.', tips: ['Connect the board in bootloader mode over USB (Chromium/Edge).', 'Pick your exact board — the wrong firmware can brick it.', '.apj verifies the board; a raw .bin does not.'] },
    de: { title: 'Firmware', body: 'Installiert oder aktualisiert die ArduPilot-Software auf dem Flight Controller. Über den seriellen Bootloader (USB) oder DFU flashen oder eine Version direkt von ArduPilot laden.', tips: ['Board im Bootloader-Modus per USB verbinden (Chromium/Edge).', 'Genaues Board wählen — falsche Firmware kann es unbrauchbar machen.', '.apj prüft das Board, ein rohes .bin nicht.'] },
  },
  accel: {
    tr: { title: 'İvmeölçer', body: 'Aracın yatay/eğim referansını belirleyen 6-pozisyon ivmeölçer kalibrasyonu. Yapılmazsa yapay ufuk ve irtifa sürüklenir.', tips: ['Düz, sağlam bir zeminde yapın.', 'Her pozisyonu ekrandaki gibi hareketsiz tutun.', 'Titreşim/hareket varken yapmayın.'] },
    en: { title: 'Accelerometer', body: 'The 6-position accel calibration that sets the vehicle’s level/attitude reference. Skip it and the artificial horizon and altitude drift.', tips: ['Do it on a flat, solid surface.', 'Hold each orientation still, as shown on screen.', 'Don’t calibrate with vibration or movement.'] },
    de: { title: 'Beschleunigungssensor', body: 'Die 6-Positionen-Kalibrierung, die die Lage-/Horizontreferenz festlegt. Ohne sie driften künstlicher Horizont und Höhe.', tips: ['Auf ebener, fester Fläche durchführen.', 'Jede Ausrichtung ruhig halten, wie am Bildschirm gezeigt.', 'Nicht bei Vibration/Bewegung kalibrieren.'] },
  },
  compass: {
    tr: { title: 'Pusula', body: 'Manyetometreyi kalibre eder — küre, taranan yönleri gösterir. Doğru yön/başlık için şarttır; kötü pusula EKF hatası ve “tuvalet çanağı” dönmesine yol açar.', tips: ['Metal, mıknatıs ve güçlü akımlardan uzak durun.', 'Tüm eksenlerde yavaşça çevirin; kırmızı bölgeler kalmasın.', 'Telefon/hoparlörü yaklaştırmayın.'] },
    en: { title: 'Compass', body: 'Calibrates the magnetometer — the sphere shows which directions are sampled. Essential for correct heading; a bad compass causes EKF errors and “toilet-bowling”.', tips: ['Keep away from metal, magnets and high current.', 'Rotate slowly on all axes until no red areas remain.', 'Keep phones/speakers away.'] },
    de: { title: 'Kompass', body: 'Kalibriert das Magnetometer — die Kugel zeigt die erfassten Richtungen. Wichtig für den korrekten Kurs; ein schlechter Kompass verursacht EKF-Fehler und Kreiseln.', tips: ['Von Metall, Magneten und hohem Strom fernhalten.', 'Langsam um alle Achsen drehen, bis keine roten Bereiche bleiben.', 'Handys/Lautsprecher fernhalten.'] },
  },
  radio: {
    tr: { title: 'Radyo (RC) kalibrasyonu', body: 'Her RC kanalının min/orta/max değerlerini yakalar; çubuk hareketini otopilota tanıtır. Yapılmazsa kontrol ters/kısıtlı olur.', tips: ['Tüm çubuk ve anahtarları uçlara kadar hareket ettirin.', 'Ortalayıp trim’i ayarlayın.', 'Ters (reverse) yönleri kontrol edin.'] },
    en: { title: 'Radio (RC) calibration', body: 'Captures each RC channel’s min/center/max so the autopilot knows your stick travel. Skip it and control is reversed or limited.', tips: ['Move every stick and switch to their extremes.', 'Center, then set the trim.', 'Check the reverse directions.'] },
    de: { title: 'Funk (RC)-Kalibrierung', body: 'Erfasst Min/Mitte/Max jedes RC-Kanals, damit der Autopilot den Knüppelweg kennt. Ohne sie ist die Steuerung invertiert oder begrenzt.', tips: ['Alle Knüppel und Schalter bis zum Anschlag bewegen.', 'Zentrieren, dann Trimmung setzen.', 'Reverse-Richtungen prüfen.'] },
  },
  rc: {
    tr: { title: 'Alıcı', body: 'Alıcı protokolü (CRSF/ELRS/SBUS…), seri RC girişi, RSSI ve kanal başına yardımcı (aux) fonksiyonları ayarlar. Otopilota alıcının nasıl konuştuğunu ve anahtarların ne yapacağını söyler.', tips: ['UART’a bağlı alıcı için o SERIAL’i RCIN (23) yapın.', 'Aux fonksiyonlarını (RTL, kalkış…) kanallara atayın.', 'RSSI için RSSI_TYPE’ı seçin.'] },
    en: { title: 'Receiver', body: 'Sets the receiver protocol (CRSF/ELRS/SBUS…), serial RC input, RSSI and per-channel aux functions. Tells the autopilot how the receiver talks and what the switches do.', tips: ['For a UART receiver set that SERIAL to RCIN (23).', 'Assign aux functions (RTL, takeoff…) to channels.', 'Pick RSSI_TYPE for signal strength.'] },
    de: { title: 'Empfänger', body: 'Legt Empfängerprotokoll (CRSF/ELRS/SBUS…), seriellen RC-Eingang, RSSI und Aux-Funktionen pro Kanal fest. Sagt dem Autopiloten, wie der Empfänger spricht und was die Schalter tun.', tips: ['Für UART-Empfänger dieses SERIAL auf RCIN (23) setzen.', 'Aux-Funktionen (RTL, Start…) Kanälen zuweisen.', 'RSSI_TYPE für Signalstärke wählen.'] },
  },
  servo: {
    tr: { title: 'Servo çıkışı', body: 'Her çıkış pininin fonksiyonu, min/trim/max, ters yönü ve canlı testi. Yüzey ve motorların doğru pinlere yönlendirilmesini sağlar.', tips: ['SERVOn_FUNCTION’ı kablolamanızla eşleştirin.', 'Test ederken pervaneleri çıkarın.', 'Yön yanlışsa ters (reverse) işaretleyin.'] },
    en: { title: 'Servo output', body: 'Per-output function, min/trim/max, reverse and a live test. Routes surfaces and motors to the correct pins.', tips: ['Match SERVOn_FUNCTION to your wiring.', 'Remove props before testing.', 'If a direction is wrong, tick reverse.'] },
    de: { title: 'Servo-Ausgang', body: 'Funktion je Ausgang, Min/Trim/Max, Reverse und Live-Test. Leitet Ruder und Motoren an die richtigen Pins.', tips: ['SERVOn_FUNCTION mit der Verkabelung abgleichen.', 'Vor dem Test Propeller entfernen.', 'Bei falscher Richtung Reverse aktivieren.'] },
  },
  plane: {
    tr: { title: 'Airframe', body: 'Uçak tipini (standart/elevon/V-kuyruk) ve kumanda yüzeyi/motor çıkışlarını eşler. Doğru karışımı kurar; böylece çubuklar doğru yüzeyleri hareket ettirir. Çok motorlu için Ana/Sol/Sağ gaz atanır.', tips: ['Önce uçak tipini seçin.', 'Her yüzeyi bir çıkışa atayın.', 'Diferansiyel itki için Sol/Sağ motoru ayarlayın.'] },
    en: { title: 'Airframe', body: 'Maps the plane type (standard/elevon/V-tail) and the control-surface/motor outputs. Sets the mixing so the sticks move the right surfaces. Multi-motor uses Main/Left/Right throttle.', tips: ['Pick the plane type first.', 'Assign each surface to an output.', 'For differential thrust set Left/Right motors.'] },
    de: { title: 'Airframe', body: 'Ordnet Flugzeugtyp (Standard/Elevon/V-Leitwerk) und Ruder-/Motorausgänge zu. Legt das Mischen fest, damit die Knüppel die richtigen Ruder bewegen. Mehrmotorig über Haupt/Links/Rechts-Gas.', tips: ['Zuerst den Flugzeugtyp wählen.', 'Jedes Ruder einem Ausgang zuweisen.', 'Für Differenzialschub Links/Rechts-Motor setzen.'] },
  },
  battery: {
    tr: { title: 'Pil / Güç', body: 'Voltaj/akım izleyici kurulumu, kapasite ve düşük-pil failsafe seviyeleri. Doğru pil telemetrisi ve güvenlik için.', tips: ['İzleyici tipini seçin (analog/güç modülü).', 'Voltajı bir multimetreye göre kalibre edin.', 'Failsafe voltaj/kapasitesini ayarlayın.'] },
    en: { title: 'Battery / Power', body: 'Voltage/current monitor setup, capacity and low-battery failsafe levels. For accurate battery telemetry and safety.', tips: ['Choose the monitor type (analog/power module).', 'Calibrate voltage against a multimeter.', 'Set the failsafe voltage/capacity.'] },
    de: { title: 'Batterie / Leistung', body: 'Spannungs-/Stromüberwachung, Kapazität und Notfall-Schwellen bei niedrigem Akku. Für genaue Akku-Telemetrie und Sicherheit.', tips: ['Monitortyp wählen (Analog/Power-Modul).', 'Spannung gegen ein Multimeter kalibrieren.', 'Failsafe-Spannung/Kapazität setzen.'] },
  },
  tune: {
    tr: { title: 'PID ayar', body: 'Hız/açı PID kazançları (uçak ve kopter ayrı). Kararlılık ve tepkiyi belirler; kötü PID salınım ya da hantallık yapar.', tips: ['Küçük adımlarla değiştirin.', 'Stabilize bir modda test edin.', 'Mümkünse AUTOTUNE kullanın.'] },
    en: { title: 'PID tuning', body: 'Rate/attitude PID gains (separate for plane and copter). They set stability and response; poor PIDs cause oscillation or sluggishness.', tips: ['Change in small steps.', 'Test in a stabilized mode.', 'Use AUTOTUNE where available.'] },
    de: { title: 'PID-Abstimmung', body: 'Raten-/Lage-PID-Werte (getrennt für Flugzeug und Copter). Bestimmen Stabilität und Ansprechverhalten; schlechte PIDs führen zu Schwingen oder Trägheit.', tips: ['In kleinen Schritten ändern.', 'In einem stabilisierten Modus testen.', 'Wenn möglich AUTOTUNE nutzen.'] },
  },
  tecs: {
    tr: { title: 'TECS (Uçak)', body: 'Uçaklar için hız/irtifa enerji denetleyicisi — gaz ve pitch’i birlikte yönetir. Hedef hız ile tırmanış/alçalışı koordine eder.', tips: ['Önce seyir/min/max hızı ayarlayın.', 'Tırmanma/alçalma hızlarını girin.', 'Kazançları küçük değiştirin.'] },
    en: { title: 'TECS (Plane)', body: 'The speed/height energy controller for planes — it manages throttle and pitch together to coordinate airspeed with climb/descent.', tips: ['Set cruise/min/max airspeed first.', 'Enter climb/sink rates.', 'Tune gains gently.'] },
    de: { title: 'TECS (Flugzeug)', body: 'Der Geschwindigkeits-/Höhen-Energieregler für Flugzeuge — steuert Gas und Pitch gemeinsam, um Fluggeschwindigkeit mit Steigen/Sinken abzustimmen.', tips: ['Zuerst Reise-/Min-/Max-Geschwindigkeit setzen.', 'Steig-/Sinkraten eingeben.', 'Verstärkungen behutsam abstimmen.'] },
  },
  modes: {
    tr: { title: 'Uçuş modları', body: 'Her anahtar pozisyonuna bir uçuş modu ve mod kanalını atar. Uçarken MANUAL/FBWA/AUTO/RTL arasında geçmenizi sağlar.', tips: ['Mod kanalını (FLTMODE_CH) ayarlayın.', 'Anahtarı oynatıp aktif pozisyonun vurgulandığını görün.', 'Mutlaka bir MANUAL/STABILIZE ve RTL bulundurun.'] },
    en: { title: 'Flight modes', body: 'Assigns a flight mode to each switch position and the mode channel. Lets you switch between MANUAL/FBWA/AUTO/RTL in flight.', tips: ['Set the mode channel (FLTMODE_CH).', 'Move the switch and confirm the active position highlights.', 'Always keep a MANUAL/STABILIZE and an RTL.'] },
    de: { title: 'Flugmodi', body: 'Weist jeder Schalterposition einen Flugmodus und den Moduskanal zu. Ermöglicht das Wechseln zwischen MANUAL/FBWA/AUTO/RTL im Flug.', tips: ['Moduskanal (FLTMODE_CH) setzen.', 'Schalter bewegen und aktive Position prüfen.', 'Immer ein MANUAL/STABILIZE und ein RTL vorhalten.'] },
  },
  failsafe: {
    tr: { title: 'Failsafe', body: 'RC/GCS/pil kaybında aracın ne yapacağını belirler. Güvenliğin temeli — kaçışları ve kazaları önler.', tips: ['RC failsafe’i RTL/İniş yapın.', 'Tezgahta test edin (motor/pervane olmadan).', 'Pil failsafe’ini ayarlayın.'] },
    en: { title: 'Failsafe', body: 'Defines what the vehicle does on loss of RC/GCS/battery. The foundation of safety — it prevents flyaways and crashes.', tips: ['Set RC failsafe to RTL/Land.', 'Test on the bench (no props).', 'Set the battery failsafe.'] },
    de: { title: 'Failsafe', body: 'Legt fest, was das Fahrzeug bei Verlust von RC/GCS/Akku tut. Grundlage der Sicherheit — verhindert Wegflüge und Abstürze.', tips: ['RC-Failsafe auf RTL/Landen setzen.', 'Auf der Werkbank testen (ohne Propeller).', 'Akku-Failsafe setzen.'] },
  },
  serial: {
    tr: { title: 'Seri portlar', body: 'Her UART için baud hızı ve protokol. Telemetri, GPS, alıcı ve çevre birimlerini bağlamak için kullanılır.', tips: ['İki uçta da baud eşleşmeli.', 'Seri alıcılar için RCIN (23).', 'OSD/gözlük için MSP/DisplayPort.'] },
    en: { title: 'Serial ports', body: 'Baud rate and protocol for each UART. Used to connect telemetry, GPS, receiver and peripherals.', tips: ['Baud must match on both ends.', 'RCIN (23) for serial receivers.', 'MSP/DisplayPort for OSD/goggles.'] },
    de: { title: 'Serielle Ports', body: 'Baudrate und Protokoll je UART. Zum Anschluss von Telemetrie, GPS, Empfänger und Peripherie.', tips: ['Baud muss an beiden Enden gleich sein.', 'RCIN (23) für serielle Empfänger.', 'MSP/DisplayPort für OSD/Brille.'] },
  },
  osd: {
    tr: { title: 'OSD', body: 'Ekran üstü gösterge düzeni (analog + HD MSP DisplayPort). Telemetriyi FPV görüntünüzde görmenizi sağlar.', tips: ['OSD_TYPE’ı etkinleştirin.', 'HD için SERIAL’i DisplayPort (42) yapın.', 'Öğeleri sürükleyin; gözlük güvenli bölgelerine dikkat.'] },
    en: { title: 'OSD', body: 'On-screen display layout (analog + HD MSP DisplayPort). Lets you see telemetry over your FPV feed.', tips: ['Enable OSD_TYPE.', 'For HD set the SERIAL to DisplayPort (42).', 'Drag elements; mind the goggle-safe zones.'] },
    de: { title: 'OSD', body: 'Bildschirmanzeige-Layout (analog + HD MSP DisplayPort). Zeigt Telemetrie über dem FPV-Bild.', tips: ['OSD_TYPE aktivieren.', 'Für HD das SERIAL auf DisplayPort (42) setzen.', 'Elemente ziehen; Brillen-Sicherzonen beachten.'] },
  },
  gps: {
    tr: { title: 'GPS', body: 'GPS alıcı tipi, ikinci GPS, otomatik seçim/blend ve öncelik. Doğru konum ve çift-GPS yedekliliği için.', tips: ['Çoğu alıcı için AUTO ya da uBlox.', 'İki GPS varsa “Blend” ikisini birleştirir.', 'Her iki GPS_TYPE’ı da ayarlayın.'] },
    en: { title: 'GPS', body: 'GPS receiver type, second GPS, auto-switch/blend and priority. For accurate position and dual-GPS redundancy.', tips: ['AUTO or uBlox for most receivers.', 'With two GPS, “Blend” fuses both.', 'Set both GPS types.'] },
    de: { title: 'GPS', body: 'GPS-Empfängertyp, zweites GPS, Auto-Umschaltung/Blend und Priorität. Für genaue Position und GPS-Redundanz.', tips: ['AUTO oder uBlox für die meisten Empfänger.', 'Mit zwei GPS fusioniert „Blend“ beide.', 'Beide GPS-Typen setzen.'] },
  },
  gimbal: {
    tr: { title: 'Gimbal / Kamera', body: 'Gimbal tipi, varsayılan mod ve eksen limitleri + kamera tetik tipi. Stabilize kamera nişanı ve fotoğraf tetiği için.', tips: ['MNT1_TYPE’ı gimbalınıza göre seçin.', 'Çubukla nişan için “RC Targeting”.', 'Roll/Pitch/Yaw limitlerini ayarlayın.'] },
    en: { title: 'Gimbal / Camera', body: 'Gimbal type, default mode and axis limits + camera trigger. For a stabilized camera aim and photo triggering.', tips: ['Set MNT1_TYPE to your gimbal.', 'Use “RC Targeting” to aim with sticks.', 'Set roll/pitch/yaw limits.'] },
    de: { title: 'Gimbal / Kamera', body: 'Gimbal-Typ, Standardmodus und Achslimits + Kameraauslöser. Für stabilisiertes Kameraziel und Foto-Auslösung.', tips: ['MNT1_TYPE auf Ihr Gimbal setzen.', '„RC Targeting“ zum Zielen mit Knüppeln.', 'Roll-/Pitch-/Yaw-Limits setzen.'] },
  },
  flow: {
    tr: { title: 'Optik Akış', body: 'GPS’siz konum tutuşu için optik akış sensörü, yönelimi ve konumu. İç mekan/alçak irtifada işe yarar.', tips: ['Bir mesafe sensörü (rangefinder) gerekir.', 'FLOW_TYPE’ı sensörünüze göre seçin.', 'Uçuşta ölçek katsayılarını kalibre edin.'] },
    en: { title: 'Optical flow', body: 'Optical-flow sensor, orientation and position for GPS-denied position hold. Useful indoors/at low altitude.', tips: ['A rangefinder is required.', 'Set FLOW_TYPE to your sensor.', 'Calibrate the scalers in flight.'] },
    de: { title: 'Optischer Fluss', body: 'Optical-Flow-Sensor, Ausrichtung und Position für GPS-freies Positionshalten. Nützlich in Innenräumen/niedriger Höhe.', tips: ['Ein Rangefinder ist erforderlich.', 'FLOW_TYPE auf Ihren Sensor setzen.', 'Skalierer im Flug kalibrieren.'] },
  },
  adsb: {
    tr: { title: 'ADS-B', body: 'ADS-B alıcı tipi ve çarpışma önleme (avoidance). İnsanlı trafiği görüp kaçınmak için.', tips: ['ADSB_TYPE’ı alıcınıza göre ayarlayın.', 'Otomatik kaçınma için AVD’yi etkinleştirin.', 'Kaçınma mesafelerini ayarlayın.'] },
    en: { title: 'ADS-B', body: 'ADS-B receiver type and collision avoidance. To see and avoid manned traffic.', tips: ['Set ADSB_TYPE to your receiver.', 'Enable AVD for automatic avoidance.', 'Set the avoidance distances.'] },
    de: { title: 'ADS-B', body: 'ADS-B-Empfängertyp und Kollisionsvermeidung. Um bemannten Verkehr zu erkennen und auszuweichen.', tips: ['ADSB_TYPE auf Ihren Empfänger setzen.', 'AVD für automatisches Ausweichen aktivieren.', 'Ausweichabstände setzen.'] },
  },
  sik: {
    tr: { title: 'SiK telemetri radyo', body: 'SiK radyo linkinin canlı sinyal/gürültü kalitesi. Uzağa uçmadan önce link sağlığını kontrol edin.', tips: ['RSSI ile gürültü farkı yüksekse link iyidir.', 'Antenleri dik ve birbirine paralel tutun.', 'Güç/air-speed radyo aracından ayarlanır.'] },
    en: { title: 'SiK telemetry radio', body: 'Live signal/noise quality of the SiK radio link. Check link health before flying far.', tips: ['A high RSSI-minus-noise margin means a good link.', 'Keep antennas vertical and parallel.', 'Set power/air-speed in the radio tool.'] },
    de: { title: 'SiK-Telemetriefunk', body: 'Live Signal-/Rauschqualität der SiK-Funkverbindung. Vor weiten Flügen die Linkqualität prüfen.', tips: ['Hoher RSSI-minus-Rausch-Abstand = gute Verbindung.', 'Antennen senkrecht und parallel halten.', 'Leistung/Air-Speed im Funk-Tool setzen.'] },
  },
  params: {
    tr: { title: 'Parametreler', body: 'Otopilotun tüm parametreleri: arama, düzenleme, .param kaydet/yükle ve dosya-araç karşılaştırma. İnce ayar ve yedekleme için.', tips: ['Önce parametreleri indirin.', 'Değişiklik öncesi yedek alın (.param).', 'Bir dosyayı seçili şekilde uygulamak için Karşılaştır’ı kullanın.'] },
    en: { title: 'Parameters', body: 'Every autopilot parameter: search, edit, save/load .param, and compare a file against the vehicle. For fine tuning and backups.', tips: ['Download the parameters first.', 'Back up (.param) before changing.', 'Use Compare to selectively apply a saved file.'] },
    de: { title: 'Parameter', body: 'Alle Autopilot-Parameter: suchen, bearbeiten, .param speichern/laden und Datei mit Fahrzeug vergleichen. Für Feinabstimmung und Backups.', tips: ['Zuerst die Parameter herunterladen.', 'Vor Änderungen sichern (.param).', 'Mit Vergleichen eine Datei gezielt anwenden.'] },
  },
};
