# E2E Testing Infrastructure

This document covers the Playwright E2E testing setup for the MCP-B NPM packages monorepo.

For test-layer definitions, mocking policy, and coverage expectations, see [TESTING_PHILOSOPHY.md](./TESTING_PHILOSOPHY.md).

## Running Tests

### Quick Start

```bash
# Install dependencies (from repo root)
pnpm install

# Build packages
pnpm build

# Install Playwright browsers
pnpm --filter mcp-e2e-tests exec playwright install chromium

# Run E2E tests
pnpm test
```

### Test Commands

```bash
# Run all E2E tests (headless)
pnpm test
pnpm test:e2e

# Run specific test suites
pnpm --filter mcp-e2e-tests test                    # Tab transport tests
pnpm --filter mcp-e2e-tests test:react-webmcp       # React WebMCP tests
pnpm test:e2e:tarball:global                        # Install packed @mcp-b/global into test app and run tab-transport E2E

# Run with Playwright UI (recommended for development)
pnpm test:e2e:ui

# Run in headed mode (see the browser)
pnpm test:e2e:headed

# Debug mode (step through tests)
pnpm test:e2e:debug

# View test report
pnpm --filter mcp-e2e-tests test:report
```

### Manual Testing

Run the test apps manually to experiment:

#### Tab Transport Test App

```bash
# Start test app dev server
pnpm --filter mcp-tab-transport-test-app dev

# Open http://localhost:5173 in browser
```

Then use the UI to:
1. Start MCP Server
2. Connect MCP Client
3. List available tools
4. Execute counter operations
5. Monitor the event log

#### React WebMCP Test App

```bash
# Start React test app
pnpm --filter react-webmcp-test-app dev

# Open http://localhost:5174 in browser
```

Test React integration:
1. See tools registered via `useWebMCP`
2. Connect client to consume tools
3. Call tools through MCP protocol
4. Observe tool state management

## Test Coverage

The Playwright test suite validates:

### Tab Transport Tests (`e2e/tests/tab-transport.spec.ts`)

**Basic Functionality**
- ✅ Application loads correctly
- ✅ MCP server starts successfully
- ✅ MCP client connects to server
- ✅ Tools can be listed via MCP protocol

**Tool Execution**
- ✅ Increment counter via MCP tool call
- ✅ Decrement counter via MCP tool call
- ✅ Reset counter via MCP tool call
- ✅ Get counter value via MCP tool call

**Advanced Scenarios**
- ✅ Multiple rapid tool calls (concurrency)
- ✅ Client disconnect and reconnect
- ✅ Server stop and restart
- ✅ Programmatic API usage

**Transport Validation**
- ✅ TabServerTransport accepts connections
- ✅ TabClientTransport establishes connections
- ✅ postMessage communication works
- ✅ JSON-RPC messages flow correctly
- ✅ State persistence across reconnections

### React WebMCP Tests (`e2e/tests/react-webmcp.spec.ts`)

**Hook Integration**
- ✅ `useWebMCP` registers tools on mount
- ✅ Tools appear in `navigator.modelContext`
- ✅ Tools unregister on component unmount
- ✅ React StrictMode compatibility (double mounting)

**Tool Registration**
- ✅ Multiple tools registered successfully
- ✅ Input schema validation with Zod
- ✅ Tool execution state tracking
- ✅ Error handling in tool handlers

**Client Consumption**
- ✅ `McpClientProvider` connects to server
- ✅ `useMcpClient` lists available tools
- ✅ Tools can be called from client
- ✅ Tool responses propagate correctly

**State Management**
- ✅ Tool execution state (isExecuting, lastResult, error)
- ✅ State updates during tool execution
- ✅ Error state management
- ✅ Execution count tracking

## CI/CD Integration

Tests run automatically in GitHub Actions:

**Workflow**: `.github/workflows/e2e.yml`

**Triggers**:
- Pull requests to `main`
- Pushes to `main`

**Steps**:
1. Install dependencies
2. Build all packages
3. Install Playwright browsers
4. Run E2E tests
5. Run tarball validation (`@mcp-b/global`) against the real test app
6. Upload test reports and screenshots

**Artifacts**:
- Playwright HTML report (30 days retention)
- Test results and screenshots (7 days retention)

## Writing New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Setup code
  });

  test('should do something', async ({ page }) => {
    // Arrange
    await page.click('#start-server');

    // Act
    await page.click('#some-action');

    // Assert
    await expect(page.locator('#result')).toHaveText('Expected');
  });
});
```

### Best Practices

1. **Use Data Attributes**: The test app uses `data-status`, `data-counter`, etc. for reliable selectors
2. **Wait for State**: Use `await expect().toHaveText()` with timeouts instead of arbitrary waits
3. **Test User Flows**: Write tests from the user's perspective, not implementation details
4. **Check Logs**: Verify operations appear in the event log
5. **Parallel Safe**: Ensure tests don't depend on shared state

### Testing Extension Transports

For Chrome Extension transports, you'll need to:

1. Create a test extension directory
2. Use Playwright's `chromium.launchPersistentContext()` with extension support
3. Test cross-extension communication

Example (future implementation):

```typescript
test('should connect via ExtensionTransport', async () => {
  const context = await chromium.launchPersistentContext('', {
    args: [
      `--disable-extensions-except=/path/to/test-extension`,
      `--load-extension=/path/to/test-extension`,
    ],
  });

  const page = await context.newPage();
  // Test extension transport
});
```

## Debugging Tests

### Playwright UI Mode (Recommended)

```bash
pnpm test:e2e:ui
```

Features:
- Visual test execution
- Time travel debugging
- DOM snapshots at each step
- Network activity logs
- Console output
- Pick locator tool

### Debug Mode

```bash
pnpm test:e2e:debug
```

Features:
- Playwright Inspector
- Step through tests line by line
- Set breakpoints
- Inspect page state
- Test selector playground

### Screenshots and Traces

Failed tests automatically capture:

- **Screenshots**: Saved in `e2e/test-results/`
- **Traces**: Viewable in Playwright UI or via `npx playwright show-trace trace.zip`

To always capture traces:

```typescript
// In playwright.config.ts
use: {
  trace: 'on', // 'on' | 'off' | 'on-first-retry' | 'retain-on-failure'
}
```

## Performance

- **Typical test suite runtime**: 30-60 seconds
- **Test parallelization**: Enabled by default (can be configured in `playwright.config.ts`)
- **CI optimization**: Uses single worker on CI for stability

## Troubleshooting

### Playwright Installation Issues

If browser installation fails:

```bash
# Install browsers with system dependencies
pnpm --filter mcp-e2e-tests exec playwright install --with-deps

# Or install specific browser
pnpm --filter mcp-e2e-tests exec playwright install chromium
```

### Port Conflicts



Playwright tab-transport runs default to `PLAYWRIGHT_TAB_TRANSPORT_PORT=4173`
and only reuse existing servers when `PLAYWRIGHT_REUSE_SERVER=1`.

If the configured port is in use:

```bash
# Find and kill process
lsof -ti:4173 | xargs kill

# Or change port in playwright.config.ts and vite.config.ts
```

### Timeout Issues

Increase timeout in test or config:

```typescript
// In test
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
});

// In config
export default defineConfig({
  timeout: 60000,
});
```

### CI Failures

Common CI issues:

1. **Missing browsers**: Ensure `playwright install` runs before tests
2. **Race conditions**: Use `expect().toHaveText()` instead of `waitForTimeout()`
3. **Flaky tests**: Add retry logic or fix timing issues

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [MCP Specification](https://modelcontextprotocol.io/)
