const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { build: buildWeb } = require('../implementation/desktop/scripts/build.cjs');
const root = path.resolve(__dirname, '..');
const consumer = path.join(root, 'examples/desktop');
const load = createRequire(path.join(consumer, 'package.json'));

const stagedInputs = Object.freeze([
  ['implementation/desktop/src/main.cjs', 'src/main.cjs'],
  ['implementation/desktop/src/shell.cjs', 'src/shell.cjs'],
  ['implementation/desktop/src/policy.cjs', 'src/policy.cjs'],
  ['implementation/verification/desktop.cjs', 'verification/desktop.cjs'],
].map(pair => Object.freeze(pair)));
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');

async function ordinaryPath(boundary, relative, { directory = false, create = false, optional = false } = {}) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe staging path');
  const parts = relative.split('/');
  let current = boundary;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const isDirectory = index < parts.length - 1 || directory;
    let information;
    try { information = await fs.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (create && isDirectory) { await fs.mkdir(current, { mode: 0o700 }); information = await fs.lstat(current); }
      else if (optional) return null;
      else throw error;
    }
    if (information.isSymbolicLink() || (isDirectory ? !information.isDirectory() : !information.isFile()) || await fs.realpath(current) !== current) throw new Error('Unsafe staging path');
  }
  return current;
}

async function componentBoundary(packageRoot) {
  const information = await fs.lstat(packageRoot);
  if (!information.isDirectory() || information.isSymbolicLink()) throw new Error('Unsafe package root');
  return await fs.realpath(packageRoot);
}

async function checkStageMembers(stage, complete) {
  const expected = new Set(stagedInputs.map(([, destination]) => destination));
  const directories = new Set(['src', 'verification']);
  const seen = new Set();
  async function visit(relative) {
    for (const name of await fs.readdir(path.join(stage, relative))) {
      const entry = relative ? relative + '/' + name : name;
      const file = path.join(stage, entry);
      const information = await fs.lstat(file);
      if (information.isSymbolicLink() || await fs.realpath(file) !== file) throw new Error('Unsafe staging member');
      if (information.isDirectory() && directories.has(entry)) await visit(entry);
      else if (information.isFile() && expected.has(entry)) seen.add(entry);
      else throw new Error('Unexpected staging member');
    }
  }
  await visit('');
  if (complete && seen.size !== expected.size) throw new Error('Missing staging member');
}

async function verifyStagedFiles(packageRoot = root) {
  const boundary = await componentBoundary(packageRoot);
  const stage = await ordinaryPath(boundary, 'examples/desktop/build/component', { directory: true });
  await checkStageMembers(stage, true);
  for (const [source, destination] of stagedInputs) {
    const original = await ordinaryPath(boundary, source);
    const staged = await ordinaryPath(boundary, 'examples/desktop/build/component/' + destination);
    if (fingerprint(await fs.readFile(original)) !== fingerprint(await fs.readFile(staged))) throw new Error('Staged source differs');
  }
  return stage;
}

async function stageProductionFiles(packageRoot = root) {
  const boundary = await componentBoundary(packageRoot);
  const inputs = [];
  for (const [source, destination] of stagedInputs) {
    const original = await ordinaryPath(boundary, source);
    inputs.push({ original, destination, bytes: await fs.readFile(original) });
  }
  await ordinaryPath(boundary, 'examples/desktop', { directory: true });
  const existing = await ordinaryPath(boundary, 'examples/desktop/build/component', { directory: true, optional: true });
  if (existing) {
    await checkStageMembers(existing, false);
    await fs.rm(existing, { recursive: true });
  }
  const stage = await ordinaryPath(boundary, 'examples/desktop/build/component', { directory: true, create: true });
  for (const input of inputs) {
    await ordinaryPath(boundary, 'examples/desktop/build/component/' + path.posix.dirname(input.destination), { directory: true, create: true });
    await fs.writeFile(path.join(stage, input.destination), input.bytes, { flag: 'wx', mode: 0o644 });
    if (fingerprint(await fs.readFile(input.original)) !== fingerprint(input.bytes)) throw new Error('Source changed during staging');
  }
  return await verifyStagedFiles(packageRoot);
}

async function packageConsumer() {
  await stageProductionFiles();
  await buildWeb({ webRoot: path.join(consumer, 'web'), outputRoot: path.join(consumer, 'build/web') });
  await verifyStagedFiles();
  const { build, Platform, Arch } = load('electron-builder');
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  await build({
    projectDir: consumer, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never',
    config: {
      appId: 'app.example.desktopfixture', productName: 'DesktopFixture', electronVersion: '45.0.0',
      directories: { output: 'artifacts' },
      files: [
        { from: consumer, to: 'consumer', filter: ['main.cjs'] },
        { from: 'build/component/src', to: 'component/src', filter: ['main.cjs', 'shell.cjs', 'policy.cjs'] },
        { from: 'build/component/verification', to: 'component/verification', filter: ['desktop.cjs'] },
        'package.json',
      ],
      extraResources: [{ from: 'build/web', to: 'web' }],
      extraMetadata: { main: 'consumer/main.cjs' },
      asar: true, npmRebuild: false, publish: null,
      artifactName: 'desktop-fixture-${version}-${arch}-unsigned.${ext}',
      win: { target: [{ target: 'nsis', arch: ['x64'] }], signAndEditExecutable: false, signExecutable: false },
      nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, runAfterFinish: false },
    },
  });
}
if (require.main === module) packageConsumer().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { packageConsumer, stageProductionFiles, verifyStagedFiles, stagedInputs };
