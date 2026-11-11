# Windows desktop instructions

Package `ourapps-ae/windows-desktop` version `0.5.0`. It provides `facility` (type `ae/desktop-host`, version 1.0.0) and optionally requires `configuration` (type `ae/windows-desktop-configuration`, version 1.0.0).

## For the agent

- Select this component when the recipe's `devices` answer includes Windows (a desktop application wrapped around the web build).
- Supply `configuration` from the recipe and the application's own details: absolute `webRoot` and `outputRoot`, a lowercase custom `scheme` (not http, https, file, data or javascript), `appName`, `partition`, `modeEvent` (the same event name `display-mode` uses), exact `serverOrigin` and `externalOrigins`.
- `serverOrigin` must be https (http only for localhost, 127.0.0.1 or [::1]). Each external origin must be https with no path or credentials.
- Connect the provided `facility` port to the application's desktop entry point. Select `display-mode` alongside so the mode marker exists before capture.
- No accounts or keys are needed. Installers, signing and publishing are not part of this component.

## For the developer

- Install paths: `components/windows-desktop/desktop/src/{main,shell,policy}.cjs`, `components/windows-desktop/desktop/scripts/build.cjs`, `components/windows-desktop/verification/desktop.cjs`, `components/windows-desktop/verification/result.mjs` (the aepm verification context and result files, for the application's Windows verification scripts).
- Build: `build({webRoot, outputRoot})` runs `npm run build:desktop` with `VITE_DESKTOP=1` in your web project and copies `dist-desktop` to `outputRoot`. You own `APP_VERSION` and `VITE_APP_VERSION`.
- Start: package the output as `resources/web`, ship the `desktop` sources with the application, make Electron resolvable from there, and call `start(settings)` once before Electron is ready.
- Display mode is read from `document.documentElement.dataset.mode`; publish it and fire `modeEvent` before capture. Unknown modes deny capture.
- Behaviour: only a trusted player main frame after interaction may capture microphone or camera; board entry invalidates pending permissions; downloads, screen capture, child navigation and unapproved external origins are denied.
- Windows runtime behaviour is unverified on this machine (no Windows host).

## How to check

From the component directory:

- `npm test` or `node --test tests/policy.test.cjs tests/result.test.cjs tests/runtime.test.cjs tests/package-staging.test.cjs` (required)
- `node scripts/platform-check.cjs package` (platform suite; installs Electron, needs network)
- `node scripts/platform-check.cjs runtime` (Windows x64 only)
- `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network` checks an archive fetched with `python3 -m aepm fetch ourapps-ae/windows-desktop@VERSION --store STORE --from https://ourapps.app` and runs its suites.

Heavy packaging and runtime checks are not part of the required set; run them only on a prepared machine.
