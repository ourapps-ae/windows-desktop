# Local workflow

Local only: no commits, pushes, remote changes or publishing without George's say-so. Licence wording remains deferred.

Required-local suite from the package root: `node --test tests/policy.test.cjs tests/result.test.cjs tests/runtime.test.cjs tests/package-staging.test.cjs` (also `npm test`).
Platform suites (heavy; install Electron over the network; do not run casually): `node scripts/platform-check.cjs package`, `node scripts/platform-check.cjs runtime` (Windows x64 only).
Review a fetched archive: `python3 -m aepm review <digest> --store STORE --policy POLICY --trusted --allow-network`. Always `-B`.
