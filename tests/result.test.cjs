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

test('the verification result writer reads the context and writes canonical results', async () => {
  const { canonical, readContext, requireOperations, makeResult, writeResult: write } = await import('../implementation/verification/result.mjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'windows-result-'));
  const saved = { context: process.env.AEPM_CONTEXT_FILE, result: process.env.AEPM_RESULT_FILE };
  try {
    const context = { format: 1, runId: 'a'.repeat(64), package: 'b'.repeat(64), id: 'windows-package', operations: ['windows-execute'], assertions: ['packaged'] };
    process.env.AEPM_CONTEXT_FILE = path.join(directory, 'context.json');
    process.env.AEPM_RESULT_FILE = path.join(directory, 'result.json');
    await fs.writeFile(process.env.AEPM_CONTEXT_FILE, JSON.stringify(context));
    const read = await readContext();
    assert.deepEqual(read, context);
    assert.throws(() => requireOperations(read, ['windows-execute', 'provider-create']), /authorization-denied/);
    await write(makeResult(read, { packaged: true }));
    const text = await fs.readFile(process.env.AEPM_RESULT_FILE, 'utf8');
    assert.equal(JSON.parse(text).runId, context.runId);
    assert.equal(text, canonical(JSON.parse(text)));
    assert.deepEqual(JSON.parse(text).assertions, [{ id: 'packaged', passed: true, actual: true }]);
  } finally {
    process.env.AEPM_CONTEXT_FILE = saved.context ?? '';
    process.env.AEPM_RESULT_FILE = saved.result ?? '';
    if (saved.context === undefined) delete process.env.AEPM_CONTEXT_FILE;
    if (saved.result === undefined) delete process.env.AEPM_RESULT_FILE;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
