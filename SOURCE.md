# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018` (frozen McInPoker, read with `git show` in `mcinpoker/`). `SOURCE.json` keeps the pinned source hashes.

| Implementation file | Frozen source and lines | Generalised | Left behind |
|---|---|---|---|
| `implementation/desktop/src/main.cjs` (26) | `desktop/src/main.cjs` 1-25 | `start(settings)` takes `scheme`, `appName`, `partition`, `serverOrigin`, `webRoot`, `modeEvent`, `externalOrigins`; validates them before Electron loads | The game's application name, scheme, partition and origins |
| `implementation/desktop/src/shell.cjs` (95) | `desktop/src/shell.cjs` 1-101 | `createShell(settings, electron, policy)` with injected Electron; permission generations and interaction state kept | Game window title, icon and menu choices |
| `implementation/desktop/src/policy.cjs` (78) | `desktop/src/policy.cjs` 1-94 | `createPolicy(settings)`: scheme and origin validation, asset resolution inside the web root, media permission rule (interacted player main frame only) | Fixed server and store origins |
| `implementation/desktop/scripts/build.cjs` (23) | `desktop/scripts/build.cjs` 1-29 | `build({webRoot, outputRoot})` with absolute-path and overlap checks, bundled-script check | The game's project paths |
| `implementation/verification/desktop.cjs` (119) | recipe `OurPoker/recipe/desktop/src/verify.cjs` 1-135 (written after the frozen revision) | Context-driven result writing and profile path helpers | Game-specific window assertions |

Tests in `tests/` and `desktop/test/` hashes in `SOURCE.json` (`policy.test.cjs`, `permissions.test.cjs`, frozen `desktop/test/`) were rewritten against neutral fixtures. `examples/desktop/` is an independent packaging consumer with its own lock for Electron 45.0.0 and electron-builder 26.15.3. `scripts/` holds the package and runtime platform checks.

The manifest marks the `configuration` requirement `optional: true` and the visual definition draws it as not required (windows-desktop-configuration is a connector for values the application can also pass in code, so a design may leave it unconnected).
