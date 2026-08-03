import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wptDirectory = resolve(root, '.reference/wpt');
const runner = resolve(wptDirectory, 'wpt');
const polyfill = resolve(root, 'packages/webmcp-polyfill/dist/index.iife.js');
const chrome = process.env.CHROME_BIN;

if (!chrome) {
  throw new Error('CHROME_BIN must point to a Chrome Canary executable');
}
if (!existsSync(runner)) {
  throw new Error(
    'Missing .reference/wpt; check out web-platform-tests/wpt at the revision pinned in .github/workflows/e2e.yml'
  );
}
if (!existsSync(polyfill)) {
  throw new Error('Missing built polyfill bundle');
}

// ponytail: page-local allowlist; add frame/origin tests only with browser-level coordination.
// Mixed exposedTo tests stay out because valid nonempty exposure is intentionally native-only.
const imperativeTests = [
  'document-domain-enabled.https.html',
  'duplicate_tool_registration.https.html',
  'executeTool-abort.https.html',
  'executeTool-error-window-onerror.https.html',
  'executeTool-invalid-dictionary.https.html',
  'getTools-imperative-annotations.https.html',
  'getTools-imperative-schema.https.html',
  'getTools.https.html',
  'model_context.https.html',
  'non-secure.html',
  'object-arguments.https.html',
  'opaque-origin-tools.https.html',
  'register-tool-title.https.html',
  'register_tool_invalid_json_schema.https.html',
  'register_tool_name_validation.https.html',
  'register_tool_no_schema.https.html',
  'register_tool_signal.https.html',
  'register_tool_toolchange.https.html',
  'register_tool_with_empty_annotation.https.html',
  'register_tool_with_schema.https.html',
];
const includes = ['/webmcp/declarative/'].concat(
  imperativeTests.map((test) => `/webmcp/imperative/${test}`)
);

const result = spawnSync(
  runner,
  [
    'run',
    '--channel',
    'canary',
    '--binary',
    chrome,
    '--yes',
    '--install-webdriver',
    '--headless',
    '--no-enable-experimental',
    '--test-types',
    'testharness',
    '--binary-arg=--no-sandbox',
    '--binary-arg=--disable-features=WebMCP,WebMCPTesting',
    '--inject-script',
    polyfill,
    '--no-pause-after-test',
    '--processes',
    '1',
    '--no-manifest-download',
    ...includes.flatMap((path) => ['--include', path]),
    'chrome',
  ],
  { cwd: wptDirectory, stdio: 'inherit' }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
