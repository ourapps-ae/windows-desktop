const preferences = {
  nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
  contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
  webviewTag: false, navigateOnDragDrop: false, spellcheck: false,
};

function createShell(settings, electron, policy) {
  const { BrowserWindow, shell } = electron;
  const { ENTRY, trustedPage, playerPage, externalURL, mediaAllowed, assetResponse } = policy;
  const modeScript = `(() => {
    const publish = () => {
      const mode = ['player', 'board'].includes(document.documentElement.dataset.mode)
        ? document.documentElement.dataset.mode : 'none';
      if (location.hash !== '#' + mode) history.replaceState(null, '', '#' + mode);
    };
    window.addEventListener(${JSON.stringify(settings.modeEvent)}, publish);
    publish();
  })()`;

  function installPermissions(session, state) {
    const allowed = (contents, permission, origin, details, types) => {
      const win = state.window;
      return Boolean(win && !win.isDestroyed() && contents === win.webContents && mediaAllowed({
        page: contents.getURL(), origin, permission, interacted: state.interacted,
        mainFrame: details.isMainFrame === true, mediaTypes: types,
      }));
    };
    session.setPermissionCheckHandler((contents, permission, origin, details) =>
      allowed(contents, permission, origin, details, [details.mediaType]));
    session.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      const origin = details.requestingUrl;
      if (!allowed(contents, permission, origin, details, details.mediaTypes)) return callback(false);
      try {
        const page = contents.getURL();
        const generation = state.generation;
        const mode = await contents.executeJavaScript('({ mode: document.documentElement.dataset.mode, interacted: navigator.userActivation.hasBeenActive })');
        callback(mode.mode === 'player' && mode.interacted && generation === state.generation && page === contents.getURL() &&
          allowed(contents, permission, origin, details, details.mediaTypes));
      } catch { callback(false); }
    });
    session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    session.on('will-download', (event) => event.preventDefault());
  }

  function createWindow(session, state, { show = true, icon } = {}) {
    const win = new BrowserWindow({
      width: 1280, height: 900, minWidth: 640, minHeight: 480,
      title: settings.appName, backgroundColor: '#101410', show, icon,
      webPreferences: { ...preferences, session },
    });
    state.window = win;
    state.interacted = false;
    state.generation = 0;
    let lastInteraction = 0;
    const interaction = () => {
      if (trustedPage(win.webContents.getURL()) && win.isFocused()) state.interacted = true;
      lastInteraction = Date.now();
    };
    win.webContents.on('before-input-event', (_event, input) => { if (input.type === 'keyDown') interaction(); });
    win.webContents.on('before-mouse-event', (_event, input) => { if (input.type === 'mouseDown') interaction(); });
    const openExternal = (url) => {
      if (trustedPage(win.webContents.getURL()) && Date.now() - lastInteraction < 1500 && externalURL(url)) {
        void shell.openExternal(url).catch(() => {});
      }
    };
    win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (!trustedPage(url)) event.preventDefault(); });
    win.webContents.on('will-frame-navigate', (event) => {
      if (!event.isMainFrame) event.preventDefault();
      else if (!trustedPage(event.url)) { event.preventDefault(); openExternal(event.url); }
    });
    win.webContents.on('will-redirect', (event) => event.preventDefault());
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
    win.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) { state.interacted = false; state.generation++; }
    });
    win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame && !playerPage(url)) { state.interacted = false; state.generation++; }
    });
    win.webContents.on('did-finish-load', () => {
      if (trustedPage(win.webContents.getURL())) {
        state.modeReady = win.webContents.executeJavaScript(modeScript).catch(() => { state.interacted = false; });
      }
    });
    win.setMenuBarVisibility(false);
    return win;
  }

  function configureSession(session, root, state) {
    session.protocol.handle(settings.scheme, (request) => assetResponse(root, request));
    installPermissions(session, state);
  }
  return { preferences, installPermissions, createWindow, configureSession, ENTRY };
}
module.exports = { preferences, createShell };
