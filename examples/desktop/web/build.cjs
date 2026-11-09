const fs = require('node:fs/promises');
const path = require('node:path');

async function build() {
  if (process.env.VITE_DESKTOP !== '1') throw new Error('Desktop build flag missing');
  const output = path.join(__dirname, 'dist-desktop');
  await fs.mkdir(output, { recursive: true });
  for (const file of ['index.html', 'client.js']) await fs.copyFile(path.join(__dirname, file), path.join(output, file));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
