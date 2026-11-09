const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const consumer = path.join(root, 'examples/desktop');
const load = createRequire(path.join(consumer, 'package.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function inspectExecutable(file) {
  const bytes = await fs.readFile(file);
  assert.equal(bytes.readUInt16LE(0), 0x5a4d);
  const header = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.readUInt32LE(header), 0x4550);
  const format = bytes.readUInt16LE(header + 24);
  assert.ok(format === 0x10b || format === 0x20b);
  const certificate = header + 24 + (format === 0x20b ? 112 : 96) + 32;
  assert.equal(bytes.readUInt32LE(certificate + 4), 0, 'Executable must remain unsigned');
  return { architecture: bytes.readUInt16LE(header + 4), digest: hash(bytes) };
}

async function checkPackage(directory = path.join(consumer, 'artifacts/win-unpacked')) {
  const executable = await inspectExecutable(path.join(directory, 'DesktopFixture.exe'));
  assert.equal(executable.architecture, 0x8664);
  const resources = path.join(directory, 'resources');
  const archive = path.join(resources, 'app.asar');
  const asar = load('@electron/asar');
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json'));
  assert.equal(metadata.main, 'consumer/main.cjs');
  assert.equal(hash(asar.extractFile(archive, metadata.main)), hash(await fs.readFile(path.join(consumer, 'main.cjs'))));
  for (const file of ['main.cjs', 'shell.cjs', 'policy.cjs']) {
    assert.equal(hash(asar.extractFile(archive, 'component/src/' + file)), hash(await fs.readFile(path.join(root, 'implementation/desktop/src', file))));
  }
  assert.equal(hash(asar.extractFile(archive, 'component/verification/desktop.cjs')), hash(await fs.readFile(path.join(root, 'implementation/verification/desktop.cjs'))));
  const module = { exports: {} };
  vm.runInNewContext(asar.extractFile(archive, 'component/src/policy.cjs').toString(), { require, module, exports: module.exports, URL, Response });
  const policy = module.exports.createPolicy({ scheme: 'desktopfixture', serverOrigin: 'https://unused.invalid', externalOrigins: [] });
  for (const file of ['index.html', 'client.js']) {
    const response = await policy.assetResponse(path.join(resources, 'web'), { url: policy.ORIGIN + '/' + file, method: 'GET' });
    assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await fs.readFile(path.join(consumer, 'web', file))));
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  const products = (await fs.readdir(path.join(consumer, 'artifacts'))).filter(file => file.endsWith('.exe'));
  assert.equal(products.length, 1);
  await inspectExecutable(path.join(consumer, 'artifacts', products[0]));
  return { packagedResources: true, componentBytes: true, unsigned: true, architecture: 'x64', windowsRuntime: false };
}
if (require.main === module) checkPackage().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkPackage };
