// The entry module of windows-desktop's desktop code: everything code outside the component may use.
const { start } = require('./src/main.cjs');
const { createPolicy } = require('./src/policy.cjs');
const { preferences, createShell } = require('./src/shell.cjs');
const result = require('../verification/result.mjs');

module.exports = {
  start, createPolicy, preferences, createShell,
  // The web build in desktop mode, run at build time only.
  build: (...args) => require('./scripts/build.cjs').build(...args),
  canonical: result.canonical, validateContext: result.validateContext, readContext: result.readContext,
  requireOperations: result.requireOperations, makeResult: result.makeResult, writeResult: result.writeResult,
  writeCanonical: result.writeCanonical, writeCleanupResult: result.writeCleanupResult,
};
