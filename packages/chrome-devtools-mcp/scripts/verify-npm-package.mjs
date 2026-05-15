/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packageName = '@mcp-b/chrome-devtools-mcp';
const requiredPaths = [
  'build/src/index.js',
  'build/src/third_party/index.js',
  'build/src/third_party/devtools-formatter-worker.js',
];
const realNpmCommandEnv = {
  ...process.env,
  npm_config_dry_run: 'false',
  NPM_CONFIG_DRY_RUN: 'false',
};

function run(command, args, options = {}) {
  const { stdio = 'pipe', ...rest } = options;
  if (stdio === 'pipe') {
    return execFileSync(command, args, { encoding: 'utf8', stdio, ...rest });
  }
  execFileSync(command, args, { stdio, ...rest });
  return '';
}

function parseJsonOutput(output) {
  const jsonStart = Math.min(
    ...['{', '['].map((marker) => output.indexOf(marker)).filter((index) => index !== -1)
  );
  return JSON.parse(output.substring(jsonStart));
}

function verifyBundledEntrypoints() {
  for (const path of [
    'build/src/third_party/index.js',
    'build/src/third_party/devtools-formatter-worker.js',
  ]) {
    const contents = readFileSync(resolve(path), 'utf-8');
    if (/(?:import\s+['"]|from\s+['"])\.\.\/\.\.\/node_modules/.test(contents)) {
      console.error(`Assertion Failed: "${path}" contains an unbundled node_modules import.`);
      process.exit(1);
    }
  }
}

function verifyPackedInstall(tarball) {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-chrome-devtools-mcp-'));
  try {
    run('npm', ['init', '-y'], {
      cwd: tmp,
      env: realNpmCommandEnv,
      stdio: 'ignore',
    });
    run('npm', ['install', '--silent', '--ignore-scripts', resolve(tarball)], {
      cwd: tmp,
      env: realNpmCommandEnv,
      stdio: 'inherit',
    });
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          `await import('${packageName}/build/src/third_party/index.js');`,
          `await import('${packageName}/build/src/third_party/devtools-formatter-worker.js');`,
        ].join(' '),
      ],
      { cwd: tmp, stdio: 'inherit' }
    );
    run(
      process.execPath,
      [
        join(
          tmp,
          'node_modules',
          '@mcp-b',
          'chrome-devtools-mcp',
          'build',
          'src',
          'bin',
          'chrome-devtools-mcp.js'
        ),
        '--help',
      ],
      { cwd: tmp, stdio: 'ignore' }
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Checks that select build files are present using npm's packlist.
function verifyPackageContents() {
  let tarball;
  try {
    const output = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']);
    const [data] = parseJsonOutput(output);
    const files = data.files.map((f) => f.path);
    // Check some important files.
    for (const requiredPath of requiredPaths) {
      if (!files.includes(requiredPath)) {
        console.error(`Assertion Failed: "${requiredPath}" not found in tarball.`);
        process.exit(1);
      }
    }

    verifyBundledEntrypoints();
    const packOutput = run('npm', ['pack', '--json', '--silent', '--ignore-scripts'], {
      env: realNpmCommandEnv,
    });
    const packData = parseJsonOutput(packOutput);
    tarball = packData[0]?.filename;
    if (!tarball) {
      console.error('Assertion Failed: npm pack did not produce a tarball.');
      process.exit(1);
    }
    verifyPackedInstall(tarball);

    console.log(`npm pack --dry-run contained ${JSON.stringify(requiredPaths)}`);
    console.log('isolated packed install imported bundled entrypoints and loaded CLI help');
  } catch (err) {
    console.error('failed to verify npm package', err);
    process.exit(1);
  } finally {
    if (tarball) {
      rmSync(tarball, { force: true });
    }
  }
}

verifyPackageContents();
