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

// ponytail: page-local allowlist; frame/origin tests qualify only if every assertion is page-local.
// Mixed exposedTo tests stay out because valid nonempty exposure is intentionally native-only.
const imperativeTests = [
  'document-domain-enabled.sub.https.html',
  'duplicate_tool_registration.https.html',
  // executeTool-abort and executeTool-error-window-onerror left the gate at wpt
  // 9ef2de8638: upstream now asserts execute(input, {signal}) threading, window
  // tool lifecycle events, and circular-result rejection the polyfill does not
  // implement yet. Restore them with that work.
  'executeTool-invalid-dictionary.https.html',
  'executeTool-unauthorized-origin.https.html',
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

// Explicit like the imperative lane, so upstream additions join the gate deliberately.
// Out at wpt 9ef2de8638, pending the same executeTool alignment as above: the new
// executeTool-abort, executeTool-respondWith-circular-object and no-frame-documents,
// plus form_removal_submit_crash and unregister-during-executeTool, which now assert
// that in-flight executions survive unregistration.
const declarativeTests = [
  'document-domain-enabled.sub.https.html',
  'duplicate-tool-name.https.html',
  'execute_tool_change_event.https.html',
  'execute_tool_submit_from_js.https.html',
  'getTools-declarative-schema.https.html',
  'opaque-origin-tools.https.html',
  'select-multiple-events.https.html',
  'toolchange-on-attribute-mutation.https.html',
  'toolchange-on-control-add-remove.https.html',
  'toolchange-on-name-change.https.html',
];

// Separate lane so an API-shape regression reports apart from the behavioral gate.
const idlOnly = process.argv.slice(2).includes('--idl');

const includes = idlOnly
  ? ['/webmcp/idlharness.https.window.html']
  : declarativeTests
      .map((test) => `/webmcp/declarative/${test}`)
      .concat(imperativeTests.map((test) => `/webmcp/imperative/${test}`));

// wptrunner treats an --include that matches nothing as a silent no-op, so a test
// renamed upstream would drop out of the gate with CI still green.
const requiredFiles = idlOnly
  ? ['webmcp/idlharness.https.window.js']
  : declarativeTests
      .map((test) => `webmcp/declarative/${test}`)
      .concat(imperativeTests.map((test) => `webmcp/imperative/${test}`));
const missing = requiredFiles.filter((path) => !existsSync(resolve(wptDirectory, path)));
if (missing.length > 0) {
  throw new Error(
    `Allowlisted WPT tests are missing from .reference/wpt (renamed or removed upstream?):\n  ${missing.join('\n  ')}`
  );
}

// idl_test(['webmcp'], ['html', 'dom']) fetches these over HTTP from the WPT root.
// They live outside the sparse-checkout paths the behavioral lane needs, and a missing
// file surfaces only as "Error fetching /interfaces/webmcp.idl" inside the browser.
if (idlOnly) {
  const idlFiles = ['webmcp.idl', 'html.idl', 'dom.idl'].filter(
    (file) => !existsSync(resolve(wptDirectory, 'interfaces', file))
  );
  if (idlFiles.length > 0) {
    throw new Error(
      `.reference/wpt is missing interfaces/{${idlFiles.join(',')}}. The sparse checkout ` +
        'must include "interfaces" (see .github/workflows/e2e.yml). Fix an existing clone with:\n' +
        '  git -C .reference/wpt sparse-checkout add interfaces'
    );
  }
}

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
