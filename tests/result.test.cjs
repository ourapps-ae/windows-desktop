const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { writeResult, profilePath } = require('../implementation/verification/desktop.cjs');

test('verification selects fake capture devices before startup without overriding permissions', async () => {
  const source = await fs.readFile(path.join(__dirname, '../examples/desktop/main.cjs'), 'utf8');
  for (const verifying of [true, false]) {
    const calls = [];
    const app = { isPackaged: false, commandLine: { appendSwitch: name => calls.push(name) }, setPath: name => calls.push(name) };
    vm.runInNewContext(source, {
      __dirname: path.join(__dirname, '../examples/desktop'),
      process: { env: verifying ? { AEPM_CONTEXT_FILE: path.join(__dirname, 'context.json') } : {} },
      require(name) {
        if (name === 'node:path') return path;
        if (name === 'electron') return { app };
        if (name === 'node:fs') return { readFileSync: () => '{}', statSync: () => ({ isDirectory: () => true }) };
        if (name.endsWith('/src/main.cjs')) return { start() { calls.push('start'); return new Promise(() => {}); } };
        if (name.endsWith('/verification/desktop.cjs')) return { profilePath };
        throw new Error('Unexpected dependency');
      },
    });
    assert.deepEqual(calls, verifying ? ['use-fake-device-for-media-stream', 'userData', 'sessionData', 'start'] : ['start']);
  }
});

test('desktop result leaves process termination and profile cleanup to the parent', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-result-fixture-'));
  const previous = process.env.AEPM_RESULT_FILE;
  process.env.AEPM_RESULT_FILE = path.join(directory, 'result.json');
  try {
    const context = { runId: 'a'.repeat(64), package: 'b'.repeat(64), id: 'runtime', assertions: ['window-live', 'process-tree-terminated'] };
    await writeResult(context, { 'window-live': true, 'process-tree-terminated': true });
    const result = JSON.parse(await fs.readFile(process.env.AEPM_RESULT_FILE, 'utf8'));
    assert.deepEqual(result.assertions, [{ id: 'process-tree-terminated', passed: false, actual: null }, { id: 'window-live', passed: true, actual: true }]);
    assert.deepEqual(result.cleanup, { required: true, attempted: true, completed: false, reason: '' });
    assert.equal(profilePath(path.join(directory, 'context.json')), path.join(directory, 'profiles/desktop'));
    assert.equal(await fs.stat(process.env.AEPM_RESULT_FILE).then(stat => stat.nlink), 1);
  } finally {
    if (previous === undefined) delete process.env.AEPM_RESULT_FILE;
    else process.env.AEPM_RESULT_FILE = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
