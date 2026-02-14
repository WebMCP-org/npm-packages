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
  path.join(repoRoot, 'package.json'),
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

    // Collect workspace:* dependencies from @mcp-b/global.
    const globalPkg = JSON.parse(
      await readFile(path.join(repoRoot, 'packages/global/package.json'), 'utf8')
    );
    const workspaceDeps = Object.entries(globalPkg.dependencies || {})
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([name]) => name);

    // Build and pack every workspace dependency plus @mcp-b/global itself.
    const tarballMap = new Map(); // @mcp-b/<name> -> absolute tarball path

    for (const depName of workspaceDeps) {
      const shortName = depName.replace('@mcp-b/', '');
      const depDir = `packages/${shortName}`;
      runCommand('pnpm', ['-C', depDir, 'build']);
      runCommand('pnpm', ['-C', depDir, 'pack', '--pack-destination', tempDir]);
    }

    runCommand('pnpm', ['-C', 'packages/global', 'build']);
    runCommand('pnpm', ['-C', 'packages/global', 'pack', '--pack-destination', tempDir]);

    // Map each tarball back to its package name.
    const allTarballs = (await readdir(tempDir)).filter((f) => f.endsWith('.tgz'));
    for (const fileName of allTarballs) {
      // Tarball filenames: mcp-b-<name>-<version>.tgz
      for (const depName of [...workspaceDeps, '@mcp-b/global']) {
        const slug = depName.replace('@mcp-b/', '').replace('/', '-');
        if (fileName.startsWith(`mcp-b-${slug}-`)) {
          tarballMap.set(depName, path.join(tempDir, fileName));
        }
      }
    }

    // Add pnpm.overrides to root package.json so that transitive workspace
    // dependencies resolve from local tarballs instead of the npm registry.
    // This is necessary when workspace packages haven't been published yet.
    const rootPkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    const overrides = {};
    for (const [name, tarballPath] of tarballMap) {
      if (name !== '@mcp-b/global') {
        overrides[name] = `file:${tarballPath}`;
      }
    }
    rootPkg.pnpm = rootPkg.pnpm || {};
    rootPkg.pnpm.overrides = { ...(rootPkg.pnpm.overrides || {}), ...overrides };
    await writeFile(path.join(repoRoot, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n');

    const globalTarball = tarballMap.get('@mcp-b/global');
    if (!globalTarball) {
      throw new Error(`Global tarball not found in ${tempDir}`);
    }

    didAttemptDependencyMutation = true;
    runCommand('pnpm', [
      '-C',
      'e2e/test-app',
      'add',
      globalTarball,
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
