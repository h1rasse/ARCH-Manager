# ARCH Manager WebUI Handoff

This archive contains only the ARCH Manager WebUI source. The frontend is built with Vite and vanilla JavaScript for KernelSU Manager.

## Source layout

- `webui/index.html` is the WebUI entry document.
- `webui/src/main.js` contains views, navigation, confirmations, and KernelSU execution flow.
- `webui/src/logic.js` contains command allowlists, argument validation, JSON parsing, error classification, and formatting helpers.
- `webui/src/styles.css` contains the current Liquid Glass visual design.
- `webui/src/mock.js` contains development-only mock data.
- `webui/tests/logic.test.js` contains frontend safety tests.
- `webui/vite.config.js` builds static output into the repository `webroot/` directory.

## Integration constraints

Keep all kernel operations behind `/data/adb/modules/arch-manager/bin/archctl`. Do not write directly to `/sys`, `/proc`, or `/data/adb` from JavaScript. Preserve the command allowlist, argument validation, confirmation dialogs, thermal checks before performance increases, profile dry-run flow, restore confirmation, and backend error handling.

The production bundle must be local-only. Do not use CDN scripts, remote fonts, remote icons, external APIs, or a web server. Keep `webroot/index.html` as the final entry point and keep the build output compatible with the existing GitHub Actions module workflow.

Use English for source identifiers and code. Keep the UI mobile-first, accessible, touch-friendly, and usable in KernelSU Manager WebView. A redesign may replace the visual hierarchy and layout completely, but it must not remove backend safety behavior.

## Local commands

```sh
cd webui
npm install
npm test
npm run build
npm run dev
```

Mock development mode:

```sh
VITE_MOCK=1 npm run dev
```

Mock mode is development-only and must not be included in the production bundle.
