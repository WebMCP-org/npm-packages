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
const skipBuild = process.argv.includes('--skip-build');
const filesToRestore = [
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'e2e/test-app/package.json'),
  path.join(repoRoot, 'pnpm-lock.yaml'),
  path.join(repoRoot, 'pnpm-workspace.yaml'),
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
    [...originalFileContents].map(([filePath, content]) => writeFile(filePath, content, 'utf8'))
  );
}

async function main() {
  const pnpmStoreDir = getPnpmStoreDir();
  const originalFileContents = new Map();
  for (const filePath of filesToRestore) {
    originalFileContents.set(filePath, await readFile(filePath, 'utf8'));
  }
  const tempDir = await mkdtemp(path.join(tmpdir(), 'mcpb-global-tarball-'));
  let didAttemptDependencyMutation = false;
  let runError;

  try {
    const globalPkg = JSON.parse(
      await readFile(path.join(repoRoot, 'packages/global/package.json'), 'utf8')
    );
    const packageNames = [
      ...Object.entries(globalPkg.dependencies ?? {})
        .filter(([, version]) => version.startsWith('workspace:'))
        .map(([name]) => name),
      '@mcp-b/global',
    ];

    // CI already built the workspace; local runs build before packing by default.
    for (const name of packageNames) {
      const packageDir = `packages/${name.replace('@mcp-b/', '')}`;
      if (!skipBuild) runCommand('pnpm', ['-C', packageDir, 'build']);
      runCommand('pnpm', ['-C', packageDir, 'pack', '--pack-destination', tempDir]);
    }

    // Tarball filenames: mcp-b-<name>-<version>.tgz
    const tarballFiles = await readdir(tempDir);
    const tarballs = new Map(
      packageNames.map((name) => {
        const prefix = `${name.replace('@', '').replace('/', '-')}-`;
        const fileName = tarballFiles.find(
          (file) => file.startsWith(prefix) && file.endsWith('.tgz')
        );
        if (!fileName) throw new Error(`Tarball for ${name} not found in ${tempDir}`);
        return [name, path.join(tempDir, fileName)];
      })
    );
    const globalTarball = tarballs.get('@mcp-b/global');
    tarballs.delete('@mcp-b/global');

    // Resolve transitive workspace dependencies from the local tarballs instead of the
    // npm registry, which may not have these versions yet.
    const rootPkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    rootPkg.pnpm = {
      ...rootPkg.pnpm,
      overrides: {
        ...rootPkg.pnpm?.overrides,
        ...Object.fromEntries([...tarballs].map(([name, file]) => [name, `file:${file}`])),
      },
    };
    await writeFile(path.join(repoRoot, 'package.json'), `${JSON.stringify(rootPkg, null, 2)}\n`);

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
        '--ignore-scripts',
        '--store-dir',
        pnpmStoreDir,
      ]);
    }
  } catch (cleanupError) {
    if (!runError) runError = cleanupError;
    else console.error('\nCleanup failed after test failure:', cleanupError);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  if (runError) throw runError;
}

await main();
