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

// Run the actual recovery/signing shell against local files; only remote tools are stubbed.
test('signature recovery validates the train and uploads the bundle cosign actually creates', () => {
  const workflow = readFileSync(new URL('../.github/workflows/changesets.yml', scripts), 'utf8');
  const step = (name) =>
    workflow
      .split(`      - name: ${name}\n`)[1]
      .split('\n      - name: ')[0]
      .split('\n  prerelease:')[0];
  const shell = (name) => step(name).split('        run: |\n')[1];
  const root = mkdtempSync(join(tmpdir(), 'signature-recovery-'));
  const name = `recovery-test-${root.split('/').at(-1)}`;
  const archive = `/tmp/${name}-5.0.3.tar.gz`;
  try {
    mkdirSync(join(root, 'bin'));
    const env = {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      RECOVER_VERSION: '5.0.3',
      GITHUB_OUTPUT: join(root, 'output'),
    };
    const run = (script, extra = {}) =>
      spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd: root,
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    const guard = shell('Validate signature recovery version');
    assert.equal(run(guard).status, 0);
    for (const version of [
      '',
      'main',
      'v5.0.3',
      '5.0.3-beta.0',
      '05.0.3',
      '5.0.3; true',
      '$(true)',
    ])
      assert.notEqual(run(guard, { RECOVER_VERSION: version }).status, 0);
    assert.match(
      step('Create Release PR or Publish'),
      /if: inputs\.recover_signatures_version == ''/
    );
    assert.match(
      workflow.split('  prerelease:')[1].split('    runs-on:')[0],
      /inputs\.recover_signatures_version == ''/
    );

    for (const [dir, manifest] of [
      ['packages/root', { name, version: '5.0.3' }],
      ['packages/root/server', { name: 'nested-server', version: '5.0.3' }],
      ['packages/private', { name: 'private', version: '0.0.0', private: true }],
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
    }
    assert.equal(
      run(
        'git init -q && git add packages && git -c user.name=Test -c user.email=test@example.com commit -qm initial && git tag "$TEST_TAG" && git tag nested-server@5.0.3',
        { TEST_TAG: `${name}@5.0.3` }
      ).status,
      0
    );
    writeFileSync(
      join(root, 'bin/gh'),
      `#!/bin/bash
set -e
if [ "$2" = view ]; then
  [ "$FAIL_RELEASE" != true ]
  if [ "$5" = tarballUrl ]; then
    echo https://example.invalid/source.tar.gz
  else
    echo '{"isDraft":false,"isPrerelease":false}'
  fi
else
  [ "$2" = upload ] && [ "$#" = 5 ] && [[ "$4" = *.sigstore ]] && [ -f "$4" ]
  echo "$4" >> uploads
fi
`,
      { mode: 0o755 }
    );
    const recovery = shell('Validate existing releases for signature recovery');
    const result = run(recovery);
    assert.equal(result.status, 0, result.stderr);
    const packages = JSON.parse(
      readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().slice('packages='.length)
    );
    assert.equal(packages.length, 2, 'include nested packages and exclude private packages');
    for (const extra of [{ RECOVER_VERSION: '5.0.4' }, { FAIL_RELEASE: 'true' }]) {
      writeFileSync(env.GITHUB_OUTPUT, '');
      assert.notEqual(run(recovery, extra).status, 0);
      assert.equal(
        readFileSync(env.GITHUB_OUTPUT, 'utf8'),
        '',
        'fail before exposing packages to signing'
      );
    }
    assert.equal(
      run('git -c user.name=Test -c user.email=test@example.com commit --allow-empty -qm newer')
        .status,
      0
    );
    assert.notEqual(run(recovery).status, 0, 'tags must point at the checkout commit');

    writeFileSync(join(root, 'bin/curl'), '#!/bin/bash\n[ "$3" = -o ] && echo source > "$4"\n', {
      mode: 0o755,
    });
    writeFileSync(
      join(root, 'bin/cosign'),
      '#!/bin/bash\n[ "$1" = sign-blob ] && [ "$3" = --yes ] && [ "$4" = --bundle ] && echo bundle > "$5"\n',
      { mode: 0o755 }
    );
    const signing = shell('Sign release artifacts with sigstore');
    const signingEnv = { PACKAGES: JSON.stringify([{ name, version: '5.0.3' }]) };
    const signed = run(signing, signingEnv);
    assert.equal(signed.status, 0, signed.stderr);
    assert.equal(readFileSync(join(root, 'uploads'), 'utf8').trim(), `${archive}.sigstore`);
    rmSync(join(root, 'uploads'));
    assert.notEqual(
      run(signing, { ...signingEnv, FAIL_RELEASE: 'true' }).status,
      0,
      'missing release must fail, not skip'
    );
    assert.equal(run('test ! -f uploads').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(archive, { force: true });
    rmSync(`${archive}.sigstore`, { force: true });
  }
});
