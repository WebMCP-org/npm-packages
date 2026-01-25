#!/usr/bin/env node

/**
 * WebMCP Setup Verification Script
 *
 * Checks that the environment is ready for WebMCP integration.
 */

import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function warning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

async function checkNodeVersion() {
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    const majorVersion = Number.parseInt(version.slice(1).split('.')[0], 10);

    if (majorVersion >= 16) {
      success(`Node.js ${version} (>= 16.0.0)`);
      return true;
    }
    error(`Node.js ${version} is too old (requires >= 16.0.0)`);
    return false;
  } catch (err) {
    error('Node.js not found');
    return false;
  }
}

async function checkBrowser() {
  try {
    // Try to find Chrome/Chromium
    const commands = {
      darwin: 'which chrome || which "Google Chrome" || echo "not found"',
      linux: 'which google-chrome || which chromium || echo "not found"',
      win32: 'where chrome || where chromium || echo "not found"',
    };

    const platform = process.platform;
    const command = commands[platform] || commands.linux;

    const { stdout } = await execAsync(command);

    if (stdout.includes('not found')) {
      warning('Chrome/Chromium not found in PATH');
      info('Chrome 90+ recommended for WebMCP development');
      return false;
    }
    success('Chrome/Chromium found');
    return true;
  } catch (err) {
    warning('Could not detect browser');
    return false;
  }
}

async function checkPackageManager() {
  const managers = ['pnpm', 'npm', 'yarn'];
  let found = false;

  for (const manager of managers) {
    try {
      await execAsync(`${manager} --version`);
      success(`${manager} is available`);
      found = true;
      break;
    } catch (err) {
      // Try next manager
    }
  }

  if (!found) {
    error('No package manager found (npm, yarn, or pnpm required)');
    return false;
  }

  return true;
}

function checkProjectStructure() {
  const cwd = process.cwd();

  // Check for package.json
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    success('package.json found');
    return true;
  }
  warning('package.json not found (okay for vanilla HTML projects)');
  return false;
}

async function checkNetworkAccess() {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch('https://unpkg.com/@mcp-b/global@latest', {
      method: 'HEAD',
      timeout: 5000,
    });

    if (response.ok) {
      success('Network access to unpkg.com (for @mcp-b/global)');
      return true;
    }
    warning('Could not reach unpkg.com');
    return false;
  } catch (err) {
    warning('Network check failed (offline or firewall?)');
    return false;
  }
}

function detectFramework() {
  const cwd = process.cwd();
  const packageJsonPath = join(cwd, 'package.json');

  if (!existsSync(packageJsonPath)) {
    info('No package.json - assuming vanilla HTML/JS project');
    return 'vanilla';
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (deps.react) {
      success('Detected React project');
      return 'react';
    }
    if (deps.vue) {
      success('Detected Vue project');
      return 'vue';
    }
    if (deps.next) {
      success('Detected Next.js project');
      return 'next';
    }
    if (deps['@angular/core']) {
      success('Detected Angular project');
      return 'angular';
    }
    if (deps.svelte) {
      success('Detected Svelte project');
      return 'svelte';
    }
    info('JavaScript/TypeScript project (framework not detected)');
    return 'other';
  } catch (_err) {
    error('Could not read package.json');
    return 'unknown';
  }
}

async function main() {
  log('\n📋 WebMCP Setup Verification\n', 'blue');

  const checks = [];

  // Run checks
  log('Checking prerequisites...', 'blue');
  checks.push(await checkNodeVersion());
  checks.push(await checkPackageManager());
  checks.push(await checkBrowser());

  log('\nChecking project...', 'blue');
  checkProjectStructure();
  const framework = detectFramework();

  log('\nChecking network...', 'blue');
  checks.push(await checkNetworkAccess());

  // Summary
  log(`\n${'='.repeat(50)}`, 'blue');

  const passed = checks.filter(Boolean).length;
  const total = checks.length;

  if (passed === total) {
    success(`\nAll checks passed! (${passed}/${total})`);
    log('\n✨ Your environment is ready for WebMCP integration!\n', 'green');

    // Recommendations based on framework
    log('Next steps:', 'blue');
    if (framework === 'react') {
      info('• Install: pnpm add @mcp-b/react-webmcp @mcp-b/global zod');
      info('• See: skills/webmcp-setup/references/REACT_SETUP.md');
    } else if (framework === 'vue' || framework === 'other') {
      info('• Install: pnpm add @mcp-b/webmcp-ts-sdk @mcp-b/global zod');
      info('• See: skills/webmcp-setup/references/VUE_SETUP.md');
    } else if (framework === 'vanilla') {
      info(
        '• Add script tag: <script src="https://unpkg.com/@mcp-b/global@latest/dist/index.global.js"></script>'
      );
      info('• See: skills/webmcp-setup/references/VANILLA_SETUP.md');
    } else if (framework === 'next') {
      info('• Install: pnpm add @mcp-b/react-webmcp @mcp-b/global zod');
      info('• See: skills/webmcp-setup/references/NEXTJS_SETUP.md');
    }

    process.exit(0);
  } else {
    warning(`\nSome checks failed (${passed}/${total} passed)`);
    log('\n⚠️  Your environment may not be ready. Review errors above.\n', 'yellow');
    process.exit(1);
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
