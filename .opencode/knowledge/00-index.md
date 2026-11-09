# windows-desktop ownership

Repository: https://github.com/ourapps-ae/windows-desktop.git (local only; nothing pushed). Package `ourapps-ae/windows-desktop`, provides `facility` (`ae/desktop-host`), requires `configuration` (`ae/windows-desktop-configuration`). Manifest format 2.
Standard: `/Users/george/Projects/com/my/.opencode/knowledge/component-standard.md`.

Code: `implementation/desktop/src/{main,shell,policy}.cjs`, `implementation/desktop/scripts/build.cjs`, `implementation/verification/desktop.cjs`. Independent consumers: `examples/consumer.cjs` and `examples/desktop/` (packaging consumer with its own lock).
Artefacts: `component.json`, `CONTRACT.md`, `INSTRUCTIONS.md`, `SOURCE.md`, `suitability.json`, `tools.lock.json`, `SOURCE.json`, `interfaces/contract.json` (carries id, type, version and operations), `tests/`, `visual/`. No data is kept, so there is no `migration.json`.
Platform checks: `scripts/platform-check.cjs package` builds the standalone consumer and checks the relocated package; `runtime` launches the packaged executable on Windows x64 only. windows-runtime has never run (no Windows host).
`package.json`, `package-lock.json`, `SOURCE.json`, `scripts/` and `implementation/verification/` are listed in `component.json` but sit outside the standard checker's allowlist; the checker reports them as layout errors only.
