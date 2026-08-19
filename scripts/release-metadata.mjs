import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pathFromRoot(path) {
  return relative(root, path);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    failures.push(`Cannot read ${pathFromRoot(path)}: ${error.message}`);
    return undefined;
  }
}

function findPackages(directory, packages = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['coverage', 'dist', 'node_modules'].includes(entry.name)) {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      findPackages(path, packages);
    } else if (entry.name === 'package.json') {
      const manifest = readJson(path);
      if (!manifest?.name || !manifest.version) continue;
      if (packages.has(manifest.name)) {
        failures.push(`Duplicate package name: ${manifest.name}`);
      }
      packages.set(manifest.name, { manifest, path });
    }
  }
  return packages;
}

function replaceOne(path, pattern, replacement, label) {
  const source = readFileSync(path, 'utf8');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${pathFromRoot(path)} must contain one ${label}; found ${matches.length}.`);
  }
  const updated = source.replace(pattern, replacement);
  if (updated !== source) writeFileSync(path, updated);
}

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !['--check', '--write'].includes(args[0]))) {
  console.error('Usage: node scripts/release-metadata.mjs [--check|--write]');
  process.exit(2);
}

const packages = findPackages(join(root, 'packages'));
const packageVersion = (name) => packages.get(name)?.manifest.version;
const relayManifestPath = join(root, 'packages/webmcp-local-relay/manifest.json');
const unpkgTestPath = join(root, 'packages/global/test-unpkg.html');
const relayVersion = packageVersion('@mcp-b/webmcp-local-relay');
const globalVersion = packageVersion('@mcp-b/global');

if (!relayVersion) failures.push('Missing package @mcp-b/webmcp-local-relay.');
if (!globalVersion) failures.push('Missing package @mcp-b/global.');

if (args[0] === '--write' && failures.length === 0) {
  try {
    replaceOne(
      relayManifestPath,
      /^(\s*"version"\s*:\s*")([^"]+)(".*)$/gm,
      `$1${relayVersion}$3`,
      'top-level version'
    );
    replaceOne(
      unpkgTestPath,
      /(https:\/\/unpkg\.com\/@mcp-b\/global@)([^/"'\s]+)(\/dist\/index\.iife\.js)/g,
      `$1${globalVersion}$3`,
      '@mcp-b/global unpkg version pin'
    );
  } catch (error) {
    failures.push(error.message);
  }
}

const rootManifest = readJson(join(root, 'package.json'));
if (rootManifest?.private !== true) {
  failures.push('Root package.json must set "private": true.');
}

const changesetConfig = readJson(join(root, '.changeset/config.json'));
if (!Array.isArray(changesetConfig?.fixed)) {
  failures.push('.changeset/config.json must declare a fixed array.');
} else {
  for (const [index, group] of changesetConfig.fixed.entries()) {
    if (!Array.isArray(group)) {
      failures.push(`Fixed group ${index + 1} must be an array.`);
      continue;
    }
    const resolved = group.map((name) => ({ name, version: packageVersion(name) }));
    for (const { name, version } of resolved) {
      if (!version) failures.push(`Fixed group ${index + 1} references missing package ${name}.`);
    }
    const versions = new Set(resolved.map(({ version }) => version).filter(Boolean));
    if (versions.size > 1) {
      failures.push(
        `Fixed group ${index + 1} has mismatched versions: ${resolved
          .map(({ name, version }) => `${name}@${version ?? 'missing'}`)
          .join(', ')}.`
      );
    }
  }
}

let changelogsChecked = 0;
const changelogsMissing = [];
for (const { manifest, path } of packages.values()) {
  if (manifest.private) continue;
  const changelogPath = join(dirname(path), 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    changelogsMissing.push(manifest.name);
    continue;
  }
  changelogsChecked += 1;
  const heading = readFileSync(changelogPath, 'utf8').match(/^##\s+(\S+)\s*$/m)?.[1];
  if (heading !== manifest.version) {
    failures.push(
      `${pathFromRoot(changelogPath)} starts at ${heading ?? 'no version'}, but ${manifest.name} is ${manifest.version}.`
    );
  }
}

const relayManifest = readJson(relayManifestPath);
if (relayManifest?.version !== relayVersion) {
  failures.push(
    `${pathFromRoot(relayManifestPath)} is ${relayManifest?.version}, but the package is ${relayVersion}.`
  );
}

const unpkgPins = [
  ...readFileSync(unpkgTestPath, 'utf8').matchAll(
    /https:\/\/unpkg\.com\/@mcp-b\/global@([^/"'\s]+)\/dist\/index\.iife\.js/g
  ),
];
if (unpkgPins.length !== 1 || unpkgPins[0][1] !== globalVersion) {
  failures.push(`${pathFromRoot(unpkgTestPath)} must pin exactly @mcp-b/global@${globalVersion}.`);
}

if (failures.length > 0) {
  console.error(`Release metadata check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const skipNote = changelogsMissing.length
  ? `, skipped ${changelogsMissing.length} with no CHANGELOG.md: ${changelogsMissing.join(', ')}`
  : '';
console.log(`Release metadata is consistent (${changelogsChecked} changelogs checked${skipNote}).`);
