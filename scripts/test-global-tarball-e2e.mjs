#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const filesToRestore = [
  path.join(repoRoot, 'e2e/test-app/package.json'),
  path.join(repoRoot, 'pnpm-lock.yaml'),
];

function runCommand(command, args) {
  const printable = [command, ...args].join(' ');
  console.log(`\n> ${printable}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${printable}`);
  }
}

function getPnpmStoreDir() {
  const modulesYamlPath = path.join(repoRoot, 'node_modules/.modules.yaml');

  try {
    const modulesYaml = readFileSync(modulesYamlPath, 'utf8');
    const match = modulesYaml.match(/^storeDir:\s*(.+)$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // Fall back to `pnpm store path` below.
  }

  const result = spawnSync('pnpm', ['store', 'path'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error('Failed to determine pnpm store path');
  }

  return result.stdout.trim();
}

async function restoreFiles(originalFileContents) {
  await Promise.all(
    filesToRestore.map(async (filePath) => {
      const original = originalFileContents.get(filePath);
      if (typeof original === 'string') {
        await writeFile(filePath, original, 'utf8');
      }
    })
  );
}

async function main() {
  const originalFileContents = new Map();
  let tempDir;
  let didAttemptDependencyMutation = false;
  let runError;
  const pnpmStoreDir = getPnpmStoreDir();

  for (const filePath of filesToRestore) {
    originalFileContents.set(filePath, await readFile(filePath, 'utf8'));
  }

  try {
    tempDir = await mkdtemp(path.join(tmpdir(), 'mcpb-global-tarball-'));

    runCommand('pnpm', ['-C', 'packages/global', 'build']);
    runCommand('pnpm', ['-C', 'packages/global', 'pack', '--pack-destination', tempDir]);

    const tarballs = (await readdir(tempDir)).filter((fileName) => fileName.endsWith('.tgz'));
    if (tarballs.length !== 1) {
      throw new Error(
        `Expected exactly one tarball in ${tempDir}, found ${tarballs.length}: ${tarballs.join(', ')}`
      );
    }

    const tarballPath = path.join(tempDir, tarballs[0]);

    didAttemptDependencyMutation = true;
    runCommand('pnpm', [
      '-C',
      'e2e/test-app',
      'add',
      tarballPath,
      '--save-exact',
      '--ignore-scripts',
      '--store-dir',
      pnpmStoreDir,
    ]);

    runCommand('pnpm', ['--filter', 'mcp-e2e-tests', 'test:tab-transport']);
    console.log('\nTarball validation passed for @mcp-b/global.');
  } catch (error) {
    runError = error;
  }

  try {
    await restoreFiles(originalFileContents);
    if (didAttemptDependencyMutation) {
      runCommand('pnpm', [
        'install',
        '--frozen-lockfile',
        '--filter',
        'mcp-tab-transport-test-app',
        '--ignore-scripts',
        '--store-dir',
        pnpmStoreDir,
      ]);
    }
  } catch (cleanupError) {
    if (!runError) {
      runError = cleanupError;
    } else {
      console.error('\nCleanup failed after test failure:', cleanupError);
    }
  } finally {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
    }
  }

  if (runError) {
    throw runError;
  }
}

await main();
