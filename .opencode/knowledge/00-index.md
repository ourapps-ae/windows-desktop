# windows-desktop ownership

Repository: https://github.com/ourapps-ae/windows-desktop.git (local only; nothing pushed). Package `ourapps-ae/windows-desktop`, provides `desktop-host` (`ae/desktop-host`), requires `windows-desktop-configuration` (`ae/windows-desktop-configuration`). Manifest format 2.

Code: `implementation/desktop/src/{main,shell,policy}.cjs`, `implementation/desktop/scripts/build.cjs`, `implementation/verification/desktop.cjs`. Independent consumers: `examples/consumer.cjs` and `examples/desktop/` (packaging consumer with its own lock).
Artefacts: `component.json`, `CONTRACT.md`, `INSTRUCTIONS.md`, `SOURCE.md`, `suitability.json`, `tools.lock.json`, `SOURCE.json`, `interfaces/desktop-host.json` (OpenRPC 1.3.2 document of the provided ae/desktop-host interface), `interfaces/required-windows-desktop-configuration.json` (JSON Schema 2020-12 of the configuration), `tests/`, `visual/`. No data is kept, so there is no `migration.json`.
Platform checks: `scripts/platform-check.cjs package` builds the standalone consumer and checks the relocated package; `runtime` launches the packaged executable on Windows x64 only. windows-runtime has never run (no Windows host).
