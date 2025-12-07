/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import tsConfig from '../tsconfig.json' with {type: 'json'};

import {sed} from './sed.ts';

const BUILD_DIR = path.join(process.cwd(), 'build');

/**
 * Renames build/node_modules to build/vendor and updates all import paths.
 *
 * This is necessary because pnpm publish automatically strips out any directory
 * named 'node_modules', even nested ones. By renaming to 'vendor', the compiled
 * chrome-devtools-frontend dependencies are included in the published package.
 */
function renameNodeModulesToVendor(): void {
  const nodeModulesDir = path.join(BUILD_DIR, 'node_modules');
  const vendorDir = path.join(BUILD_DIR, 'vendor');

  if (!fs.existsSync(nodeModulesDir)) {
    console.log('No build/node_modules directory found, skipping rename');
    return;
  }

  // Rename the directory
  console.log('Renaming build/node_modules to build/vendor...');
  fs.renameSync(nodeModulesDir, vendorDir);

  // Update all import paths in the built JS files
  console.log('Updating import paths from node_modules to vendor...');
  const srcDir = path.join(BUILD_DIR, 'src');
  updateImportPathsInDir(srcDir);

  console.log('Successfully renamed node_modules to vendor');
}

/**
 * Recursively updates import paths in all JS files in a directory.
 */
function updateImportPathsInDir(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      updateImportPathsInDir(fullPath);
    } else if (entry.name.endsWith('.js')) {
      updateImportPathsInFile(fullPath);
    }
  }
}

/**
 * Updates import paths in a single JS file from node_modules to vendor.
 */
function updateImportPathsInFile(filePath: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Replace various forms of node_modules imports with vendor
  // Handles: '../node_modules/', '../../node_modules/', etc.
  content = content.replace(
    /(['"])(\.\.\/)+(node_modules\/)/g,
    (match, quote, dots) => `${quote}${dots.repeat(match.split('../').length - 1)}vendor/`,
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Writes content to a file.
 * @param filePath The path to the file.
 * @param content The content to write.
 */
function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Ensures that licenses for third party files we use gets copied into the build/ dir.
 */
function copyThirdPartyLicenseFiles() {
  const thirdPartyDirectories = tsConfig.include.filter(location => {
    return location.includes(
      'node_modules/chrome-devtools-frontend/front_end/third_party',
    );
  });

  for (const thirdPartyDir of thirdPartyDirectories) {
    const fullPath = path.join(process.cwd(), thirdPartyDir);
    const licenseFile = path.join(fullPath, 'LICENSE');
    if (!fs.existsSync(licenseFile)) {
      console.error('No LICENSE for', path.basename(thirdPartyDir));
    }

    const destinationDir = path.join(BUILD_DIR, thirdPartyDir);
    const destinationFile = path.join(destinationDir, 'LICENSE');
    fs.copyFileSync(licenseFile, destinationFile);
  }
}

function main(): void {
  const devtoolsThirdPartyPath =
    'node_modules/chrome-devtools-frontend/front_end/third_party';
  const devtoolsFrontEndCorePath =
    'node_modules/chrome-devtools-frontend/front_end/core';

  // Create i18n mock
  const i18nDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'i18n');
  const localesFile = path.join(i18nDir, 'locales.js');
  const localesContent = `
export const LOCALES = [
  'en-US',
];

export const BUNDLED_LOCALES = [
  'en-US',
];

export const DEFAULT_LOCALE = 'en-US';

export const REMOTE_FETCH_PATTERN = '@HOST@/remote/serve_file/@VERSION@/core/i18n/locales/@LOCALE@.json';

export const LOCAL_FETCH_PATTERN = './locales/@LOCALE@.json';`;
  writeFile(localesFile, localesContent);

  // Create codemirror.next mock.
  const codeMirrorDir = path.join(
    BUILD_DIR,
    devtoolsThirdPartyPath,
    'codemirror.next',
  );
  fs.mkdirSync(codeMirrorDir, {recursive: true});
  const codeMirrorFile = path.join(codeMirrorDir, 'codemirror.next.js');
  const codeMirrorContent = `export default {}`;
  writeFile(codeMirrorFile, codeMirrorContent);

  // Create root mock
  const rootDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'root');
  fs.mkdirSync(rootDir, {recursive: true});
  const runtimeFile = path.join(rootDir, 'Runtime.js');
  const runtimeContent = `
export function getChromeVersion() { return ''; };
export const hostConfig = {};
export const Runtime = {
  isDescriptorEnabled: () => true,
  queryParam: () => null,
}
export const experiments = {
  isEnabled: () => false,
}
  `;
  writeFile(runtimeFile, runtimeContent);

  // Update protocol_client to remove:
  // 1. self.Protocol assignment
  // 2. Call to register backend commands.
  const protocolClientDir = path.join(
    BUILD_DIR,
    devtoolsFrontEndCorePath,
    'protocol_client',
  );
  const clientFile = path.join(protocolClientDir, 'protocol_client.js');
  const globalAssignment = /self\.Protocol = self\.Protocol \|\| \{\};/;
  const registerCommands =
    /InspectorBackendCommands\.registerCommands\(InspectorBackend\.inspectorBackend\);/;
  sed(clientFile, globalAssignment, '');
  sed(clientFile, registerCommands, '');

  const devtoolsLicensePath = path.join(
    'node_modules',
    'chrome-devtools-frontend',
    'LICENSE',
  );
  const devtoolsLicenseFileSource = path.join(
    process.cwd(),
    devtoolsLicensePath,
  );
  const devtoolsLicenseFileDestination = path.join(
    BUILD_DIR,
    devtoolsLicensePath,
  );
  fs.copyFileSync(devtoolsLicenseFileSource, devtoolsLicenseFileDestination);

  copyThirdPartyLicenseFiles();
  copyDevToolsDescriptionFiles();

  // IMPORTANT: This must be called last!
  // Rename build/node_modules to build/vendor so pnpm publish includes it.
  // pnpm automatically strips directories named 'node_modules' from packages.
  renameNodeModulesToVendor();
}

function copyDevToolsDescriptionFiles() {
  const devtoolsIssuesDescriptionPath =
    'node_modules/chrome-devtools-frontend/front_end/models/issues_manager/descriptions';
  const sourceDir = path.join(process.cwd(), devtoolsIssuesDescriptionPath);
  const destDir = path.join(BUILD_DIR, devtoolsIssuesDescriptionPath);
  fs.cpSync(sourceDir, destDir, {recursive: true});
}

main();
