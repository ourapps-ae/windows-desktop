const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

async function build({ webRoot, outputRoot }) {
  if (!path.isAbsolute(webRoot) || !path.isAbsolute(outputRoot)) throw new Error('Build paths must be absolute');
  const source = path.join(webRoot, 'dist-desktop');
  if (outputRoot === webRoot || source === outputRoot || webRoot.startsWith(outputRoot + path.sep) || outputRoot.startsWith(source + path.sep)) throw new Error('Build paths overlap');
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['run', 'build:desktop'], {
    cwd: webRoot, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, VITE_DESKTOP: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Web desktop build exited ${result.status}`);
  const html = await fs.readFile(path.join(source, 'index.html'), 'utf8');
  if (/install-banner|<script[^>]*https?:/i.test(html)) throw new Error('Desktop entry must use bundled scripts only');
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.cp(source, outputRoot, { recursive: true, dereference: true });
}

module.exports = { build };
