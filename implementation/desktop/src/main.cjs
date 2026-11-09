const path = require('node:path');
const { createPolicy } = require('./policy.cjs');
const { createShell } = require('./shell.cjs');

async function start(settings) {
  if (!path.isAbsolute(settings.webRoot)) throw new Error('webRoot must be absolute');
  if (!settings.appName || !settings.partition || !settings.modeEvent) throw new Error('Missing desktop settings');
  const policy = createPolicy(settings);
  const electron = require('electron');
  const { app, protocol, session } = electron;
  const host = createShell(settings, electron, policy);
  protocol.registerSchemesAsPrivileged([policy.SCHEME]);
  app.enableSandbox();
  app.setName(settings.appName);
  app.on('window-all-closed', () => app.quit());
  await app.whenReady();
  const state = { window: null, interacted: false };
  const currentSession = session.fromPartition(settings.partition);
  host.configureSession(currentSession, settings.webRoot, state);
  const win = host.createWindow(currentSession, state);
  await win.loadURL(policy.ENTRY);
  await state.modeReady;
  return win;
}

module.exports = { start };
