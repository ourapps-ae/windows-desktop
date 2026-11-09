const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { checkPackage } = require('./check-package.cjs');

async function test() {
  const source = path.resolve(__dirname, '../examples/desktop/artifacts/win-unpacked');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-package-check-'));
  try {
    const moved = path.join(temporary, 'relocated');
    await fs.cp(source, moved, { recursive: true });
    await checkPackage(moved);
    const script = path.join(moved, 'resources/web/client.js');
    await fs.appendFile(script, '\nthrow new Error("altered fixture");\n');
    await assert.rejects(checkPackage(moved));
    await fs.rm(script);
    await assert.rejects(checkPackage(moved));
    console.log('Relocated package passed; altered and missing scripts rejected.');
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
if (require.main === module) test().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { verifyRelocation: test };
