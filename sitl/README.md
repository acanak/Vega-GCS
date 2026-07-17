# ArduPilot Plane SITL - Docker Kurulumu

Bu kurulum, ArduPilot **Plane** (sabit kanat) uçağını bilgisayarında SITL
(Software-In-The-Loop) simülasyonu olarak Docker içinde çalıştırır. Gerçek
donanıma ihtiyaç yok; simüle edilmiş uçağa Mission Planner / QGroundControl
gibi bir yer istasyonundan bağlanabilirsin.

## Gereksinimler
- Docker + Docker Compose kurulu
- İlk build ~15-30 dk sürer (kaynak kod indirilip firmware derlenir)

## Çalıştırma

```bash
# İmajı derle (ilk seferde uzun sürer)
docker compose build

# SITL'i başlat
docker compose up
```

Konsolda `MAVProxy` başladığında ve `Init ArduPlane` mesajlarını gördüğünde
simülasyon hazırdır.

## Yer istasyonundan bağlanma

Mission Planner veya QGroundControl'de:
- Bağlantı türü: **TCP**
- Host: `127.0.0.1`
- Port: `5760`

## Faydalı SITL komutları

Container içindeki MAVProxy konsolunda:

```
mode GUIDED         # uçuş modu değiştir
arm throttle        # motorları arm et
takeoff 50          # 50 metreye kalkış
mode AUTO           # görev moduna geç
```

## Farklı bir başlangıç konumu / harita

`Dockerfile` içindeki CMD satırında `-L` parametresi ile konum verebilirsin:

```
sim_vehicle.py -v ArduPlane --console --map -L Ankara
```

Not: `--map` ve `--console` GUI gerektirir; başsız (headless) sunucuda
`--out=tcpin:0.0.0.0:5760` ile yer istasyonuna bağlanmak daha pratiktir.

## Durdurma

```bash
docker compose down
```
