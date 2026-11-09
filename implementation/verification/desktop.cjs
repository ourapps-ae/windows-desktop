const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

async function writeResult(context, observed) {
  const assertions = [...context.assertions].sort().map(id => id === 'process-tree-terminated'
    ? { id, passed: false, actual: null }
    : { id, passed: observed[id] === true, actual: Object.hasOwn(observed, id) ? observed[id] : null });
  const result = { format: 1, runId: context.runId, package: context.package, id: context.id,
    assertions, artifacts: [], resources: [], cleanup: { required: true, attempted: true, completed: false, reason: '' } };
  const target = process.env.AEPM_RESULT_FILE;
  const handle = await fs.open(target + '.pending', 'wx', 0o600);
  try { await handle.writeFile(canonical(result)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(target + '.pending', target);
  return result;
}

async function captureAfterInput(win) {
  win.show();
  win.focus();
  const focusDeadline = Date.now() + 2000;
  while (!win.isFocused()) {
    if (Date.now() >= focusDeadline) throw new Error('timeout');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const contents = win.webContents;
  contents.focus();
  const point = await contents.executeJavaScript(`(() => {
    document.getElementById('aepm-capture-probe')?.remove();
    const state = {done:false,activated:false,granted:false,ended:false,count:0};
    window.__aepmCaptureProbe = state;
    const button = document.createElement('button');
    button.id = 'aepm-capture-probe'; button.type = 'button'; button.textContent = 'Capture check';
    Object.assign(button.style,{position:'fixed',left:'8px',top:'8px',width:'32px',height:'32px',zIndex:'2147483647',pointerEvents:'auto'});
    button.onclick = async event => {
      state.activated = event.isTrusted && navigator.userActivation.hasBeenActive;
      let tracks = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:true});
        tracks = stream.getTracks(); state.count = tracks.length; state.granted = true;
      } catch { state.granted = false; }
      finally {
        tracks.forEach(track => track.stop());
        state.ended = tracks.every(track => track.readyState === 'ended');
        state.done = true; button.remove();
      }
    };
    document.body.append(button);
    const bounds = button.getBoundingClientRect();
    return {x:Math.round(bounds.left+bounds.width/2),y:Math.round(bounds.top+bounds.height/2)};
  })()`);
  contents.sendInputEvent({ type: 'mouseMove', ...point });
  contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const observed = await contents.executeJavaScript('window.__aepmCaptureProbe');
    if (observed?.done) return observed;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('timeout');
}

async function transition(contents, mode, action) {
  let listener;
  let timer;
  const observed = new Promise((resolve, reject) => {
    listener = (_event, url, mainFrame) => { if (mainFrame && url.endsWith('#' + mode)) resolve(); };
    contents.on('did-navigate-in-page', listener);
    timer = setTimeout(() => reject(new Error('timeout')), 5000);
  });
  try { await Promise.all([action(), observed]); }
  finally { clearTimeout(timer); contents.removeListener('did-navigate-in-page', listener); }
}

async function verifyWindow(win, { entry, enterDisplay, enterPlayer, rendered }) {
  const { BrowserWindow, app } = require('electron');
  assert.equal(app.commandLine.hasSwitch('use-fake-device-for-media-stream'), true);
  assert.equal(app.commandLine.hasSwitch('use-fake-ui-for-media-stream'), false);
  const observed = {};
  const contents = win.webContents;
  observed['window-live'] = !win.isDestroyed() && !contents.isDestroyed();
  const initial = await contents.executeJavaScript(`(async () => {
    const response = await fetch('/index.html');
    return {status:response.status,secure:isSecureContext,node:typeof require,process:typeof process};
  })()`);
  observed['assets-loaded'] = initial.status === 200 && initial.secure && initial.node === 'undefined' && initial.process === 'undefined' && await rendered();
  const preferences = contents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  const count = BrowserWindow.getAllWindows().length;
  await contents.executeJavaScript("window.open('https://denied.invalid/');location.href='https://denied.invalid/'");
  await new Promise(resolve => setTimeout(resolve, 100));
  observed['navigation-denied'] = BrowserWindow.getAllWindows().length === count && contents.getURL().split('#')[0] === entry;
  await enterPlayer();
  const playerCapture = await captureAfterInput(win);
  await transition(contents, 'board', enterDisplay);
  const board = await contents.executeJavaScript("({mode:document.documentElement.dataset.mode,hash:location.hash})");
  const boardCapture = await captureAfterInput(win);
  observed['board-capture-denied'] = playerCapture.activated && playerCapture.granted && playerCapture.count > 0 && playerCapture.ended &&
    boardCapture.activated && boardCapture.granted === false && boardCapture.ended;
  await transition(contents, 'player', enterPlayer);
  const player = await contents.executeJavaScript("({mode:document.documentElement.dataset.mode,hash:location.hash})");
  observed['mode-transition'] = board.mode === 'board' && board.hash === '#board' && player.mode === 'player' && player.hash === '#player';
  return observed;
}

function profilePath(contextFile) {
  return path.join(path.dirname(contextFile), 'profiles', 'desktop');
}

module.exports = { verifyWindow, writeResult, profilePath };
