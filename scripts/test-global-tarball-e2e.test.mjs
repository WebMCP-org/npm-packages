import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

for (const failBrowser of [false, true]) {
  test(`tarball validation restores manifests and catalog after browser ${failBrowser ? 'failure' : 'success'}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'tarball-restoration-'));
    try {
      for (const directory of [
        'scripts',
        'bin',
        'e2e/test-app',
        'packages/global',
        'node_modules',
      ]) {
        mkdirSync(join(root, directory), { recursive: true });
      }
      copyFileSync(
        new URL('./test-global-tarball-e2e.mjs', import.meta.url),
        join(root, 'scripts/test-global-tarball-e2e.mjs')
      );
      const originals = {
        'package.json': '{"name":"fixture","pnpm":{"overrides":{"existing":"1.0.0"}}}\n',
        'e2e/test-app/package.json': '{"name":"mcp-tab-transport-test-app"}\n',
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
        'pnpm-workspace.yaml': 'packages:\n  - e2e/*\ncatalog:\n  react: ^19.0.0\n',
      };
      for (const [file, content] of Object.entries(originals)) {
        writeFileSync(join(root, file), content);
      }
      writeFileSync(join(root, 'packages/global/package.json'), '{"dependencies":{}}');
      writeFileSync(join(root, 'node_modules/.modules.yaml'), 'storeDir: /fixture-store\n');
      writeFileSync(
        join(root, 'bin/pnpm'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('pack')) {
  const destination = args[args.indexOf('--pack-destination') + 1];
  fs.writeFileSync(path.join(destination, 'mcp-b-global-1.0.0.tgz'), 'fixture');
} else if (args.includes('add')) {
  for (const file of ['e2e/test-app/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    fs.writeFileSync(file, 'temporary tarball dependency mutation');
  }
} else if (args.includes('test:tab-transport')) {
  process.exit(process.env.TARBALL_TEST_FAIL_BROWSER === '1' ? 17 : 0);
} else if (args[0] === 'install') {
  fs.writeFileSync('catalog-at-install.txt', fs.readFileSync('pnpm-workspace.yaml'));
} else {
  throw new Error('Unexpected pnpm command: ' + args.join(' '));
}
`,
        { mode: 0o755 }
      );

      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts/test-global-tarball-e2e.mjs'), '--skip-build'],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${join(root, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
            TARBALL_TEST_FAIL_BROWSER: failBrowser ? '1' : '0',
          },
          encoding: 'utf8',
        }
      );
      assert.equal(result.status, failBrowser ? 1 : 0, result.stderr);
      if (failBrowser) assert.match(result.stderr, /Command failed \(17\).*test:tab-transport/);
      for (const [file, content] of Object.entries(originals)) {
        assert.equal(readFileSync(join(root, file), 'utf8'), content, `${file} was not restored`);
      }
      assert.equal(
        readFileSync(join(root, 'catalog-at-install.txt'), 'utf8'),
        originals['pnpm-workspace.yaml'],
        'catalog must be restored before the frozen-lockfile install'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
