# Local workflow

Local only: no commits, pushes, remote changes or publishing without George's say-so. Licence wording remains deferred.
Do not edit `mcinpoker/`, `skull/`, `aepm/`, `OurPoker/proof/` or `OurPoker/recipe/`.

Required-local suite from the package root: `node --test tests/policy.test.cjs tests/result.test.cjs tests/runtime.test.cjs tests/package-staging.test.cjs` (also `npm test`).
Platform suites (heavy; install Electron over the network; do not run casually): `node scripts/platform-check.cjs package`, `node scripts/platform-check.cjs runtime` (Windows x64 only).
Validate: `PYTHONPATH=/Users/george/Projects/com/my/aepm /Users/george/.pyenv/versions/3.12.8/bin/python3.12 -B /Users/george/Projects/com/my/tools/check_component.py components/windows-desktop`. Always `-B`.
