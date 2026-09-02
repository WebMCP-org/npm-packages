import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';

test('audit fails closed and only excludes advisories with known ignored paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'audit-filtered-'));
  try {
    writeFileSync(
      join(root, 'pnpm'),
      '#!/usr/bin/env node\nprocess.stdout.write(process.env.AUDIT_TEST_REPORT);\nprocess.exitCode = Number(process.env.AUDIT_TEST_STATUS);\n',
      { mode: 0o755 }
    );
    const report = (paths, severity = 'critical') => ({
      advisories: {
        1: { id: 1, module_name: 'test-package', severity, findings: [{ paths }] },
      },
    });
    const cases = [
      ['clean', { advisories: {} }, 0, 0],
      ['excluded', report(['e2e__test-app>test-package']), 1, 0],
      ['mixed', report(['e2e__test-app>test-package', 'packages__global>test-package']), 1, 1],
      ['production', report(['packages__global>test-package']), 1, 1],
      ['below threshold', report(['packages__global>test-package'], 'moderate'), 0, 0],
      ['informational', report(['packages__global>test-package'], 'info'), 0, 0],
      ['registry error', { error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } }, 1, 1],
      ['error with empty report', { error: { code: 'E500' }, advisories: {} }, 0, 1],
      ['missing report', {}, 0, 1],
      ['array report', { advisories: [] }, 0, 1],
      ['failed empty report', { advisories: {} }, 1, 1],
      ['unexpected exit', { advisories: {} }, 2, 1],
      ['missing paths', report(undefined), 1, 1],
      ['empty paths', report([]), 1, 1],
      ['unknown severity', report(['packages__global>test-package'], 'unknown'), 1, 1],
      ['invalid JSON', '{broken', 1, 1],
    ];
    for (const [name, body, auditStatus, expected] of cases) {
      const result = spawnSync(
        process.execPath,
        [
          new URL('./audit-filtered.mjs', import.meta.url).pathname,
          '--level',
          'high',
          '--ignore-prefix',
          'e2e__',
          '--prod',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${root}${delimiter}${process.env.PATH}`,
            AUDIT_TEST_REPORT: typeof body === 'string' ? body : JSON.stringify(body),
            AUDIT_TEST_STATUS: String(auditStatus),
          },
        }
      );
      assert.equal(result.status, expected, `${name}: ${result.stdout}\n${result.stderr}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
