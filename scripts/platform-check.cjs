const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { packageConsumer } = require('./package-consumer.cjs');
const { checkPackage } = require('./check-package.cjs');
const { verifyRelocation } = require('./check-package-rejection.cjs');
const { writeResult } = require('../implementation/verification/desktop.cjs');

async function main() {
  const context = JSON.parse(await fs.readFile(process.env.AEPM_CONTEXT_FILE, 'utf8'));
  if (context.mode !== 'local') throw new Error('authorization-denied');
  if (process.argv[2] === 'package') {
    if (!context.operations.includes('windows-package')) throw new Error('authorization-denied');
    await packageConsumer();
    await checkPackage();
    await verifyRelocation();
    const result = await writeResult(context, Object.fromEntries(['executable-architecture','entrypoint-present','component-present','relocated-web','script-integrity'].map(id => [id,true])));
    if (result.assertions.some(assertion => !assertion.passed)) throw new Error('assertion-failed');
  } else if (process.argv[2] === 'runtime') {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('host-unavailable');
    if (!context.operations.includes('windows-execute') || context.settings.windowsArchitecture !== 'x64') throw new Error('authorization-denied');
    const executable = path.resolve(__dirname, '../examples/desktop/artifacts/win-unpacked/DesktopFixture.exe');
    await checkPackage();
    await verifyRelocation();
    const child = spawn(executable, [], { stdio: 'ignore', env: process.env, windowsHide: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 55000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('process-failed')); });
    });
    const childResult = JSON.parse(await fs.readFile(process.env.AEPM_RESULT_FILE, 'utf8'));
    if (['runId','package','id'].some(key => childResult[key] !== context[key])) throw new Error('result-invalid');
    const observed = Object.fromEntries(childResult.assertions.filter(assertion => assertion.actual !== null).map(assertion => [assertion.id, assertion.actual]));
    for (const id of ['executable-architecture','entrypoint-present','component-present','relocated-web','script-integrity']) observed[id] = true;
    await writeResult(context, observed);
  } else throw new Error('context-invalid');
}
main().catch(() => { process.exit(1); });
