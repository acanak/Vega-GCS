# Roost GCS

A modern, browser-based ground control station for ArduPilot vehicles (plane, copter, rover). No install — it runs in the browser and talks to your autopilot over USB (WebSerial) or a WebSocket bridge (SITL / network telemetry).

## Features

- **Flight data** — glass-cockpit HUD (theme-aware), MapLibre map with live position, flight track, scale bar, and auto-pan; systems panel with battery/GPS/mode/altitude tiles; live autopilot message feed.
- **GCS assistant** — chat with the GCS in natural language (TR/EN) to run actions (arm, mode, takeoff, speed) and read/write parameters. Safe by design: a deterministic command layer executes everything; an optional LLM (via the bridge) only interprets intent — backends: Codex CLI (ChatGPT subscription), OpenAI, or Anthropic.
- **Mission planning** — waypoints, survey/lawnmower generation, geofence, rally points, `.waypoints` (QGC WPL 110) import/export, drag-to-edit map.
- **Parameters** — searchable tree editor, `.param` load/save, and a compare view (file vs. vehicle) with selective apply.
- **Setup** — firmware, accel/compass/radio calibration (with step-by-step visual guidance), RC/receiver (incl. ELRS options), servo output, plane (V-Tail/Elevon), battery, PID and **TECS** tuning (guided, live capture), flight modes, failsafe, serial ports, and an **OSD designer** (analog + HD MSP DisplayPort) that renders elements as they appear on-screen.
- **Vehicle-type-aware** — flight mode lists and mode names adapt to the connected vehicle (plane/copter/rover).
- **Logs** — download dataflash logs over MAVFtp and analyze `.bin`/`.tlog` (charts, FFT, 3D replay, track map); fast parameter download via MAVFtp.
- **Localization & themes** — English, German, Turkish; light/dark with selectable color schemes.

## Architecture

Browsers can't open raw TCP/UDP sockets, so MAVLink can't run natively. Two link types cover every case:

- **WebSerial** — direct to a USB autopilot/radio (primary, serverless, Chromium-based browsers).
- **WebSocket** — via a small bridge (TCP/UDP/serial ↔ WebSocket) for SITL and network telemetry.

MAVLink parsing/encoding and protocol state run in a **Web Worker**, keeping the render thread smooth.

The project is a pnpm monorepo:

| Package | Purpose |
|---|---|
| `packages/mavlink-codec` | MAVLink v1/v2 codec, CRC, generated dialect, generic decode/encode |
| `packages/link` | Pluggable `Link`: WebSerial + WebSocket |
| `packages/protocol` | `ProtocolEngine` (link-agnostic core): heartbeat, telemetry, arm/mode/commands, params, MAVFtp |
| `packages/mission` | Mission model, MAV_CMD catalog, `.waypoints` I/O, map geometry |
| `packages/logparser` | Dataflash (`.bin`) and `.tlog` parsing for analysis/replay |
| `apps/web-gcs` | React SPA + protocol Web Worker (UI, HUD, map, setup, assistant) |
| `tools/mavgen` | MAVLink XML → TypeScript dialect generator (crc_extra + wire layout) |
| `tools/dev-bridge` | SITL/UDP/TCP MAVLink ↔ WebSocket bridge (+ optional assistant proxy) |

## Getting started

```bash
pnpm install

npm run dev        # Vite dev server → http://localhost:5173
npm run bridge     # MAVLink (SITL/UDP/TCP) ↔ WebSocket bridge on :8080
npm run dev:sitl   # ArduPlane SITL (Docker) + bridge + app, one command
```

### Real hardware (USB autopilot)
Run `npm run dev`, open the app in a Chromium-based browser, choose the **WebSerial** link, set the baud (e.g. 57600), and Connect → pick the USB port. No bridge required.

### SITL
```bash
npm run dev:sitl            # starts SITL + bridge + app
# in the browser: WebSocket link → ws://localhost:8080 → Connect
```
SITL parameters persist across restarts; use `SITL_RESET=1 npm run dev:sitl` for a clean slate.

### AI assistant (optional)
The assistant works out of the box in local command mode. To enable a real LLM through the bridge:

```bash
# ChatGPT subscription via Codex CLI (run `codex login` first):
CHAT_BACKEND=codex npm run dev:sitl
# or API keys:
ANTHROPIC_API_KEY=...  npm run dev:sitl
OPENAI_API_KEY=...  CHAT_BACKEND=openai  npm run dev:sitl
```

### Build & test
```bash
npm run build              # all packages (incl. vite build)
npm run test               # package test suites
npm run generate:dialect   # regenerate the MAVLink dialect
```

## Desktop app (Windows / macOS / Linux)

A native desktop build is provided via Electron (`apps/desktop`). It bundles the web app, serves it locally, runs the MAVLink bridge in-process (UDP telemetry ↔ WebSocket), and enables WebSerial for USB autopilots — so USB and network telemetry both work with no separate bridge.

```bash
pnpm install
npm run desktop         # build the web app + launch the desktop app (dev)
npm run desktop:build   # produce installers into apps/desktop/release/
```

`desktop:build` produces, per host OS: **Windows** (NSIS installer + portable `.exe`), **macOS** (`.dmg`), **Linux** (`.AppImage`). Build each target on its own OS (or in CI — GitHub Actions matrix). Code signing/notarization needs your own certificates.

## iPad / tablet (PWA)

The app is an installable PWA (offline-capable, cached tiles). On iPad, open it in Safari and **Add to Home Screen**. iPadOS Safari does **not** support WebSerial (no USB), so on tablets connect over the network: run the bridge on a companion computer / laptop and use the **WebSocket** link (`ws://<host>:8080`) with UDP/telemetry forwarded to it. Android/Chromebook Chrome additionally support WebSerial for direct USB.

## License

See [LICENSE](./LICENSE).
