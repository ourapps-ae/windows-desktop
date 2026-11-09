const path = require('node:path');
const fs = require('node:fs/promises');

function createPolicy(settings) {
  const { scheme, serverOrigin, externalOrigins } = settings;
  if (!/^[a-z][a-z0-9-]*$/.test(scheme) || ['http', 'https', 'file', 'data', 'javascript'].includes(scheme)) throw new Error('Invalid application scheme');
  const server = new URL(serverOrigin);
  if (!['https:', 'http:'].includes(server.protocol) || server.origin !== serverOrigin || server.username || server.password) throw new Error('Invalid server origin');
  if (server.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)) throw new Error('Insecure server origin');
  for (const value of externalOrigins) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Invalid external origin');
  }
  const ORIGIN = `${scheme}://app`;
  const ENTRY = `${ORIGIN}/index.html`;
  const SCHEME = { scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } };

  function trustedURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === `${scheme}:` && url.hostname === 'app' && !url.port && !url.username && !url.password;
    } catch { return false; }
  }
  function trustedPage(value) {
    if (!trustedURL(value)) return false;
    const url = new URL(value);
    return ['', '/', '/index.html'].includes(url.pathname) && !url.search;
  }
  function playerPage(value) { return trustedPage(value) && new URL(value).hash === '#player'; }
  function externalURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && externalOrigins.includes(url.origin);
    } catch { return false; }
  }
  async function assetPath(root, value) {
    if (!trustedURL(value)) return null;
    const raw = value.replace(/^[a-z][a-z0-9-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
    let decoded;
    try { decoded = decodeURIComponent(raw || '/'); } catch { return null; }
    if (/[\\\0:%]/.test(decoded) || decoded.split('/').some((part) => part === '..' || part === '.')) return null;
    const file = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
    try {
      const [base, resolved] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
      if (!resolved.startsWith(`${base}${path.sep}`) || !(await fs.stat(resolved)).isFile()) return null;
      return resolved;
    } catch { return null; }
  }
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.wasm': 'application/wasm',
  };
  const HEADERS = {
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https: wss: ${serverOrigin} ${serverOrigin.replace(/^http/, 'ws')}; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(), geolocation=(), usb=()',
    'Cache-Control': 'no-store',
  };
  async function assetResponse(root, request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const file = await assetPath(root, request.url);
    if (!file) return new Response('Not found', { status: 404, headers: HEADERS });
    return new Response(request.method === 'HEAD' ? null : await fs.readFile(file), {
      headers: { ...HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' },
    });
  }
  function mediaAllowed({ page, origin, permission, interacted, mainFrame, mediaTypes }) {
    return permission === 'media' && playerPage(page) && trustedPage(origin) && interacted && mainFrame &&
      Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio' || type === 'video');
  }
  return { ORIGIN, ENTRY, SCHEME, trustedURL, trustedPage, playerPage, externalURL, assetPath, assetResponse, mediaAllowed };
}

module.exports = { createPolicy };
