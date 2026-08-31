import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const scripts = new URL('.', import.meta.url);

test('release guards reject unsafe tags and unresolved protocols without publishing', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-safety-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.changeset'));
    copyFileSync(new URL('npm-dist-tag.mjs', scripts), join(root, 'scripts/npm-dist-tag.mjs'));
    const pre = join(root, '.changeset/pre.json');
    const tag = () =>
      spawnSync(process.execPath, [join(root, 'scripts/npm-dist-tag.mjs')], { encoding: 'utf8' });
    assert.equal(tag().stdout, 'latest');
    for (const [state, expected] of [
      [{ mode: 'pre', tag: 'beta' }, 'beta'],
      [{ mode: 'exit', tag: 'beta' }, 'latest'],
    ]) {
      writeFileSync(pre, JSON.stringify(state));
      assert.equal(tag().stdout, expected);
    }
    for (const state of [
      null,
      {},
      { mode: 'pre' },
      { mode: 'pre', tag: 'latest' },
      { mode: 'pre', tag: '$(false)' },
    ]) {
      writeFileSync(pre, JSON.stringify(state));
      assert.notEqual(tag().status, 0);
    }
    writeFileSync(pre, '{broken');
    assert.notEqual(tag().status, 0);
    rmSync(pre);
    mkdirSync(pre);
    assert.notEqual(tag().status, 0, 'unreadable state must not fall back to latest');

    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { sibling: 'workspace:*' } })
    );
    const validate = (agent) =>
      spawnSync(process.execPath, [new URL('validate-publish.js', scripts).pathname], {
        cwd: root,
        env: { ...process.env, npm_config_user_agent: agent },
        encoding: 'utf8',
      });
    assert.equal(validate('pnpm/10.14.0 npm/? node/v24').status, 0);
    for (const agent of ['', 'npm/11.14.1', 'yarn/4.0.0', 'not-pnpm/1'])
      assert.notEqual(validate(agent).status, 0);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test' }));
    assert.equal(validate('').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Execute the workflow's actual input guard without running its version/publish commands.
test('snapshot dispatch rejects shell input, latest, and existing pre state', () => {
  const workflow = readFileSync(new URL('../.github/workflows/changesets.yml', scripts), 'utf8');
  const guard = workflow
    .split('      - name: Create prerelease versions')[1]
    .split('        run: |\n')[1]
    .split('          pnpm exec changeset version')[0];
  const root = mkdtempSync(join(tmpdir(), 'snapshot-guard-'));
  try {
    mkdirSync(join(root, '.changeset'));
    const check = (tag) =>
      spawnSync('bash', ['-e', '-c', guard], {
        cwd: root,
        env: { ...process.env, TAG_SUFFIX: tag },
        encoding: 'utf8',
      });
    assert.equal(check('beta').status, 0);
    assert.equal(check('canary-next').status, 0);
    for (const tag of ['latest', '', '1.0', 'beta; exit 0', '$(exit 0)', 'Beta']) {
      assert.notEqual(check(tag).status, 0);
    }
    writeFileSync(join(root, '.changeset/pre.json'), '{}');
    assert.notEqual(check('beta').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
