const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

async function fixture({ denyPlayer = false, allowBoard = false, fakeDevices = true } = {}) {
  const source = await fs.readFile(path.join(__dirname, '../implementation/verification/desktop.cjs'), 'utf8');
  const entry = 'fixture://app/index.html';
  let mode = 'player';
  let focused = false;
  let interacted = false;
  let activated = false;
  let button;
  let pending;
  const tracks = [];
  const requests = [];
  const inputs = [];
  const document = {
    documentElement: { dataset: { mode } },
    getElementById: () => button,
    createElement: () => ({ style: {}, remove() { button = null; }, getBoundingClientRect: () => ({ left: 8, top: 8, width: 32, height: 32 }) }),
    body: { append(value) { button = value; } },
  };
  const location = { get hash() { return '#' + mode; }, get href() { return entry + '#' + mode; }, set href(_value) {} };
  const window = { open() {} };
  const renderer = vm.createContext({ document, location, window, isSecureContext: true,
    fetch: async () => ({ status: 200 }),
    navigator: {
      userActivation: { get hasBeenActive() { return activated; } },
      mediaDevices: { async getUserMedia() {
        requests.push({ mode, interacted, activated });
        if (!interacted || !activated || (mode === 'player' ? denyPlayer : !allowBoard)) throw new Error('denied fixture');
        const current = ['audio', 'video'].map(kind => ({ kind, readyState: 'live', stop() { this.readyState = 'ended'; } }));
        tracks.push(...current);
        return { getTracks: () => current };
      } },
    },
  });
  const contents = new EventEmitter();
  Object.assign(contents, {
    isDestroyed: () => false, focus() {}, getURL: () => entry + '#' + mode,
    getLastWebPreferences: () => ({ sandbox: true, contextIsolation: true, nodeIntegration: false }),
    async executeJavaScript(script) {
      if (script === 'window.__aepmCaptureProbe') await pending;
      return await vm.runInContext(script, renderer);
    },
    sendInputEvent(event) {
      inputs.push({ mode, type: event.type });
      if (event.type === 'mouseDown') { interacted = focused; activated = true; }
      if (event.type === 'mouseUp') pending = button.onclick({ isTrusted: true });
    },
  });
  const win = { webContents: contents, isDestroyed: () => false, show() {}, focus() { focused = true; }, isFocused: () => focused };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return { BrowserWindow: { getAllWindows: () => [win] }, app: { commandLine: { hasSwitch: flag => flag === 'use-fake-device-for-media-stream' && fakeDevices } } };
      return require(name);
    },
  });
  const change = value => {
    const changed = mode !== value;
    mode = value; document.documentElement.dataset.mode = value;
    if (changed) { interacted = false; contents.emit('did-navigate-in-page', {}, entry + '#' + mode, true); }
  };
  return { tracks, requests, inputs, verify: () => module.exports.verifyWindow(win, {
    entry, rendered: async () => true, enterPlayer: async () => change('player'), enterDisplay: async () => change('board'),
  }) };
}

test('runtime fixture proves activated player capture then re-interacts after board reset', async () => {
  const state = await fixture();
  const result = await state.verify();
  assert.equal(result['board-capture-denied'], true);
  assert.deepEqual(state.requests, [{ mode: 'player', interacted: true, activated: true }, { mode: 'board', interacted: true, activated: true }]);
  assert.ok(state.inputs.some(input => input.mode === 'board' && input.type === 'mouseDown'));
  assert.equal(state.tracks.length, 2);
  assert.ok(state.tracks.every(track => track.readyState === 'ended'));
});

test('denied player capture cannot produce a passing board-denial assertion', async () => {
  const state = await fixture({ denyPlayer: true });
  assert.equal((await state.verify())['board-capture-denied'], false);
});

test('unexpected board permission fails and stops every fake track', async () => {
  const state = await fixture({ allowBoard: true });
  assert.equal((await state.verify())['board-capture-denied'], false);
  assert.equal(state.tracks.length, 4);
  assert.ok(state.tracks.every(track => track.readyState === 'ended'));
});

test('missing fake-device selection fails before any media request', async () => {
  const state = await fixture({ fakeDevices: false });
  await assert.rejects(state.verify());
  assert.deepEqual(state.requests, []);
});
