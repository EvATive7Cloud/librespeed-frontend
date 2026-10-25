# EvATive7 LibreSpeed Frontend

A compact, responsive frontend for the official
[`librespeed/speedtest-go`](https://github.com/librespeed/speedtest-go) backend.
It keeps LibreSpeed's browser test engine while replacing the modern interface
with a flat diagnostic dashboard, live throughput graphs, clearer test phases,
and a mobile-friendly layout.

Live deployment: <https://speed.evative7.host/>

## Highlights

- Real-time download and upload graphs
- Download, upload, latency, and jitter results
- Explicit initialization and failure states
- Single-server and multi-server support
- Classic frontend fallback
- Separate stability test
- No analytics or telemetry enabled by default

## Deploy with speedtest-go

1. Download an official `speedtest-go` release.
2. Copy this repository's contents into the backend's `assets` directory.
3. Set `assets_path` in `settings.toml` to that directory.
4. Adjust `server-list.json`, `cli-servers.json`, and `settings.json` for the
   deployment.
5. Start `speedtest-backend` and open its HTTP endpoint.

The root `index.html` reads `config.json` and redirects to either
`index-modern.html` or `index-classic.html`. See [DESIGN_SWITCH.md](DESIGN_SWITCH.md)
for the selection rules.

## Repository layout

- `index-modern.html` — flat dashboard entry point
- `frontend/` — dashboard JavaScript, CSS, and images
- `index-classic.html` — classic LibreSpeed frontend
- `speedtest.js` and `speedtest_worker.js` — LibreSpeed browser test engine
- `stability.html` and `stability_worker.js` — stability test
- `server-list.json` — browser test endpoint configuration
- `cli-servers.json` — sample `librespeed-cli` server list
- `settings.json` — frontend speed-test parameters

## Attribution and license

This project is based on [LibreSpeed](https://github.com/librespeed/speedtest)
and its official Go backend. LibreSpeed is Copyright © Federico Dossena and
contributors. The project is distributed under the GNU Lesser General Public
License v3.0; see [LICENSE](LICENSE).

