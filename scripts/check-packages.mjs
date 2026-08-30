#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const packages = JSON.parse(
  run('pnpm', ['--filter', './packages/**', 'list', '--depth', '-1', '--json'])
).filter((pkg) => !pkg.private);
assert(packages.length > 0, 'No public workspace packages found');

function targets(value) {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
}

const directory = mkdtempSync(join(tmpdir(), 'mcpb-package-check-'));
try {
  for (const pkg of packages) {
    const { filename } = JSON.parse(
      run('pnpm', ['pack', '--json', '--pack-destination', directory], pkg.path)
    );
    const files = new Set(run('tar', ['-tzf', filename]).trim().split('\n'));
    const manifest = JSON.parse(run('tar', ['-xOf', filename, 'package/package.json']));
    assert.equal(manifest.name, pkg.name, 'Packed package name changed');
    assert.equal(manifest.version, pkg.version, `${pkg.name}: packed version changed`);

    for (const field of ['exports', 'types', 'typings', 'main', 'module', 'bin']) {
      for (const target of targets(manifest[field])) {
        const relative = target.replace(/^\.\//, '');
        assert(
          !relative.startsWith('/') && !relative.split('/').includes('..'),
          `${pkg.name}: ${field} target escapes the package: ${target}`
        );
        const pattern = new RegExp(
          `^package/${relative
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*')}$`
        );
        assert(
          [...files].some((file) => pattern.test(file)),
          `${pkg.name}: ${field} target missing from tarball: ${target}`
        );
      }
    }

    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] || {})) {
        assert(
          typeof version === 'string' && !/^(workspace|catalog|link|file):/.test(version),
          `${pkg.name}: ${field}.${name} has an unresolved local dependency: ${version}`
        );
      }
    }
    console.log(`✓ ${pkg.name}@${pkg.version}: packed targets and dependencies verified`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
