/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';

// Checks that the selected build files are present using `npm pack --dry-run`.
function verifyPackageContents() {
  try {
    const output = execSync(
      'npm pack --dry-run --json --silent --ignore-scripts',
      {
        encoding: 'utf8',
      },
    );
    const data = JSON.parse(output.substring(output.indexOf('[')))[0];
    const files = data.files.map(f => f.path);
    // Check some important files.
    const requiredPaths = [
      'build/src/bin/chrome-devtools.js',
      'build/src/bin/chrome-devtools-mcp.js',
      'build/src/index.js',
      'build/src/third_party/index.js',
    ];
    for (const requiredPath of requiredPaths) {
      if (!files.includes(requiredPath)) {
        console.error(
          `Assertion Failed: "${requiredPath}" not found in tarball.`,
        );
        process.exit(1);
      }
    }
    console.log(
      `npm pack --dry-run contained ${JSON.stringify(requiredPaths)}`,
    );
  } catch (err) {
    console.error('failed to parse npm pack output', err);
    process.exit(1);
  }
}

verifyPackageContents();
