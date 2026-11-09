const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { stageProductionFiles, verifyStagedFiles, stagedInputs } = require('../scripts/package-consumer.cjs');

const inputs = [
  ['implementation/desktop/src/main.cjs', 'src/main.cjs'],
  ['implementation/desktop/src/shell.cjs', 'src/shell.cjs'],
  ['implementation/desktop/src/policy.cjs', 'src/policy.cjs'],
  ['implementation/verification/desktop.cjs', 'verification/desktop.cjs'],
];

async function fixture(run) {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-staging-')));
  const root = path.join(temporary, 'source');
  for (const directory of ['source/examples/desktop', 'home', 'temporary', 'outside']) await fs.mkdir(path.join(temporary, directory), { recursive: true });
  for (const [source] of inputs) {
    const target = path.join(root, source);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(__dirname, '..', source), target);
  }
  const sentinel = path.join(temporary, 'outside/sentinel');
  await fs.writeFile(sentinel, 'unrelated content');
  try { await run({ root, temporary, sentinel, stage: path.join(root, 'examples/desktop/build/component') }); }
  finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

test('staging contains exactly four byte-identical production files inside the packaging project', async () => {
  assert.deepEqual(stagedInputs, inputs);
  await fixture(async ({ root, stage }) => {
    assert.equal(await stageProductionFiles(root), stage);
    assert.deepEqual((await fs.readdir(path.join(stage, 'src'))).sort(), ['main.cjs', 'policy.cjs', 'shell.cjs']);
    assert.deepEqual(await fs.readdir(path.join(stage, 'verification')), ['desktop.cjs']);
    for (const [source, destination] of inputs) assert.deepEqual(await fs.readFile(path.join(root, source)), await fs.readFile(path.join(stage, destination)));
    assert.equal(await stageProductionFiles(root), stage);
    assert.equal(await verifyStagedFiles(root), stage);
  });
});

test('source file link is rejected before deleting existing staging', async () => {
  await fixture(async ({ root, stage, sentinel }) => {
    await stageProductionFiles(root);
    const before = await fs.readFile(path.join(stage, 'src/main.cjs'));
    const source = path.join(root, inputs[0][0]);
    await fs.rm(source);
    await fs.symlink(sentinel, source);
    await assert.rejects(stageProductionFiles(root), /Unsafe staging path/);
    assert.deepEqual(await fs.readFile(path.join(stage, 'src/main.cjs')), before);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'unrelated content');
  });
});

test('source ancestor link cannot import bytes from outside the component', async () => {
  await fixture(async ({ root, temporary, sentinel }) => {
    await fs.rm(path.join(root, 'implementation/desktop'), { recursive: true });
    await fs.symlink(path.join(temporary, 'outside'), path.join(root, 'implementation/desktop'), 'dir');
    await assert.rejects(stageProductionFiles(root), /Unsafe staging path/);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'unrelated content');
  });
});

test('destination ancestor link is rejected before deleting or copying outside files', async () => {
  await fixture(async ({ root, temporary, sentinel }) => {
    await fs.symlink(path.join(temporary, 'outside'), path.join(root, 'examples/desktop/build'), 'dir');
    await assert.rejects(stageProductionFiles(root), /Unsafe staging path/);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'unrelated content');
    assert.deepEqual(await fs.readdir(path.dirname(sentinel)), ['sentinel']);
  });
});

test('existing staging links and unexpected files are rejected rather than copied or deleted', async () => {
  await fixture(async ({ root, stage, sentinel }) => {
    await stageProductionFiles(root);
    await fs.symlink(sentinel, path.join(stage, 'src/unexpected.cjs'));
    await assert.rejects(stageProductionFiles(root), /Unsafe staging member/);
    assert.ok((await fs.lstat(path.join(stage, 'src/unexpected.cjs'))).isSymbolicLink());
    await fs.rm(path.join(stage, 'src/unexpected.cjs'));
    await fs.writeFile(path.join(stage, 'src/unexpected.cjs'), 'unreviewed');
    await assert.rejects(stageProductionFiles(root), /Unexpected staging member/);
    assert.equal(await fs.readFile(path.join(stage, 'src/unexpected.cjs'), 'utf8'), 'unreviewed');
  });
});

test('tampered or missing staged bytes fail the pre-package comparison', async () => {
  await fixture(async ({ root, stage }) => {
    await stageProductionFiles(root);
    const target = path.join(stage, 'src/policy.cjs');
    await fs.appendFile(target, '\n// altered fixture\n');
    await assert.rejects(verifyStagedFiles(root), /Staged source differs/);
    await fs.rm(target);
    await assert.rejects(verifyStagedFiles(root), /Missing staging member/);
  });
});

test('linked package root is not accepted', async () => {
  await fixture(async ({ root, temporary }) => {
    const alias = path.join(temporary, 'alias');
    await fs.symlink(root, alias, 'dir');
    await assert.rejects(stageProductionFiles(alias), /Unsafe package root/);
  });
});
