const path = require('node:path');
const { app } = require('electron');
const fs = require('node:fs');
const { start } = require(app.isPackaged ? '../component/src/main.cjs' : '../../implementation/desktop/src/main.cjs');
const verification = require(app.isPackaged ? '../component/verification/desktop.cjs' : '../../implementation/verification/desktop.cjs');
const contextFile = process.env.AEPM_CONTEXT_FILE;
const context = contextFile ? JSON.parse(fs.readFileSync(contextFile, 'utf8')) : null;
if (context) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  const profile = verification.profilePath(contextFile);
  if (!fs.statSync(profile).isDirectory()) throw new Error('resource-missing');
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
}

start({
  scheme: 'desktopfixture', appName: 'DesktopFixture', partition: 'persist:desktopfixture',
  serverOrigin: 'https://unused.invalid',
  webRoot: app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'build/web'),
  modeEvent: 'fixture-mode', externalOrigins: [],
}).then(async win => {
  if (!context) return;
  const observed = await verification.verifyWindow(win, {
    entry: 'desktopfixture://app/index.html',
    rendered: () => win.webContents.executeJavaScript("document.getElementById('fixture')?.textContent === 'Standalone component consumer'"),
    enterDisplay: () => win.webContents.executeJavaScript("document.getElementById('board').click()"),
    enterPlayer: () => win.webContents.executeJavaScript("document.getElementById('player').click()"),
  });
  await verification.writeResult(context, observed);
  app.exit(Object.values(observed).every(value => value === true) ? 0 : 1);
}).catch(() => app.exit(1));
