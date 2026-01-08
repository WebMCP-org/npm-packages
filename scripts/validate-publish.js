#!/usr/bin/env node
/**
 * Validates that publishing is done via pnpm (which resolves workspace:* and catalog: protocols)
 * rather than npm (which does NOT resolve them, causing broken publishes).
 *
 * Run automatically via prepublishOnly hook in each package.
 */

import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Check if we're running from pnpm or npm
const userAgent = process.env.npm_config_user_agent || '';
const isPnpm = userAgent.includes('pnpm');
const isNpm = userAgent.includes('npm') && !isPnpm;

// Collect all unresolved protocols
const unresolvedProtocols = [];
const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

for (const depType of depTypes) {
  const deps = packageJson[depType] || {};
  for (const [pkg, version] of Object.entries(deps)) {
    if (typeof version === 'string') {
      if (version.startsWith('workspace:') || version.startsWith('catalog:')) {
        unresolvedProtocols.push({ depType, pkg, version });
      }
    }
  }
}

const hasUnresolvedProtocols = unresolvedProtocols.length > 0;

// If running from npm and there are unresolved protocols, fail
if (isNpm && hasUnresolvedProtocols) {
  console.error('ERROR: Cannot publish with npm when package.json contains pnpm protocols!\n');
  console.error('Found unresolved protocols:');
  for (const { depType, pkg, version } of unresolvedProtocols) {
    console.error(`  - ${depType}.${pkg}: "${version}"`);
  }
  console.error('\nnpm does NOT resolve workspace:* or catalog: protocols.');
  console.error("Use 'pnpm --filter <package> publish' or publish via CI/changesets.\n");
  process.exit(1);
}

// If running from pnpm with unresolved protocols, that's OK - pnpm will resolve them
if (isPnpm && hasUnresolvedProtocols) {
  console.log(
    `✓ ${packageJson.name} - pnpm will resolve ${unresolvedProtocols.length} protocol(s) during pack`
  );
  process.exit(0);
}

// If no unresolved protocols, always pass
if (!hasUnresolvedProtocols) {
  console.log(`✓ ${packageJson.name} ready to publish (no protocols to resolve)`);
  process.exit(0);
}

// Unknown package manager with unresolved protocols - warn but allow (for CI flexibility)
console.warn(`⚠ ${packageJson.name} - unknown package manager, proceeding with caution`);
console.warn(`  Found ${unresolvedProtocols.length} unresolved protocol(s)`);
process.exit(0);
