# Deploying Vega GCS (web) — Cloudflare Pages

The web app is a static PWA, so Cloudflare Pages hosts it for free (generous free tier: unlimited
bandwidth, free automatic SSL). WebSerial and WebUSB (DFU) work because Pages serves over HTTPS and
the user opens it in a Chromium browser (Chrome / Edge). Firefox and Safari do not support WebSerial.

## 1) Cloudflare Pages — connect the repo (Git integration)

Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
select the repository (private repos work too), branch `main`, then set:

| Setting | Value |
|---|---|
| Framework preset | **None** (or Vite) |
| Build command | `pnpm --filter @wmp/web-gcs build` |
| Build output directory | `apps/web-gcs/dist` |
| Root directory | *(leave empty = repo root)* |

Deploy → you get `https://vega-gcs.<subdomain>.workers.dev` (or `vega-gcs.pages.dev`). Every push to `main` redeploys.

### Deploy target (`wrangler.toml`)
The repo ships a root `wrangler.toml` so the deploy step (`npx wrangler deploy`, Workers Static
Assets) knows exactly what to upload — without it, wrangler fails in a monorepo with
*"application detection logic has been run in the root of a workspace"*:
```toml
name = "vega-gcs"
compatibility_date = "2024-11-01"
[assets]
directory = "apps/web-gcs/dist"
not_found_handling = "single-page-application"
```
**Important:** `name` must match your Cloudflare project's name. If your project is named differently,
edit `name` in `wrangler.toml` (or rename the project) so they match.

*Classic Pages alternative:* if you use a **Pages** project (not Workers Builds), leave the deploy
command empty and set **Build output directory** = `apps/web-gcs/dist`; Pages auto-uploads it and
`wrangler.toml` is not used.

Notes:
- pnpm is auto-detected from `pnpm-lock.yaml`. `apps/desktop` (Electron) is excluded from the pnpm
  workspace (`pnpm-workspace.yaml`), so the build stays fast and never pulls Electron.
- Node version is pinned by `.node-version` (22).
- SPA/deep-link fallback: `not_found_handling = "single-page-application"` (wrangler.toml). Do **not**
  add a `_redirects` `/* /index.html 200` rule for Workers Static Assets — Cloudflare rejects it as an
  infinite loop. (A classic **Pages** project would use `_redirects` instead of `not_found_handling`.)
- No COOP/COEP or extra headers are needed for WebSerial/WebUSB — only HTTPS (automatic).
- The "chunks larger than 500 kB" line is a **warning, not an error** (Cesium/MapLibre are large); it does not fail the build.

## 2) Custom domain (registered at GoDaddy)

**Recommended — move DNS to Cloudflare** (free; enables the apex/root domain + auto SSL):
1. Cloudflare Dashboard → **Add a site** → enter your domain → **Free** plan. Cloudflare shows **2 nameservers**.
2. GoDaddy → your domain → **DNS** → **Nameservers** → **Change** → **I'll use my own / Custom** →
   paste the 2 Cloudflare nameservers → save. (Propagation: minutes to a few hours.)
3. Cloudflare → your **Pages project** → **Custom domains** → **Set up a domain** →
   add `yourdomain.com` and/or `gcs.yourdomain.com`. DNS record + SSL are created automatically.

**Subdomain only — keep DNS at GoDaddy** (simpler, but no root domain):
- GoDaddy → DNS → add a **CNAME**: name `gcs` → value `vega-gcs.pages.dev`.
- The apex/root (`yourdomain.com`) cannot be a CNAME at GoDaddy; use the nameserver move above for the root.

## 3) The bridge (network telemetry / firmware download / assistant) — optional

USB (WebSerial/DFU) needs **no server**. The Node bridge (`tools/dev-bridge`) is only for network/SITL
telemetry and the `/fw` (firmware download) + `/chat` (assistant) proxies. Run it near the vehicle
(companion computer / laptop) — that is $0 and the correct place. If it must be internet-reachable,
the cheapest always-on option is an Oracle Cloud Always Free VM, and it must be served over **wss://**
(TLS) so an HTTPS page can connect to it (`ws://localhost` is exempt and works during local dev).

## Local build
```bash
pnpm install
pnpm --filter @wmp/web-gcs build   # output: apps/web-gcs/dist
```
