# Testing Infrastructure

This document describes the testing infrastructure for the MCP-B NPM packages monorepo.

## Overview

We use **Playwright** for end-to-end testing of browser-based transports, which is the appropriate choice because:

1. **Real Browser Environment**: MCP transports rely on browser APIs like `postMessage`, Chrome runtime messaging, and DOM events
2. **Integration Testing**: Tests the complete communication flow between MCP servers and clients
3. **User Perspective**: Validates behavior from the user's perspective, not just unit-level correctness
4. **Visual Debugging**: Playwright UI mode makes it easy to see what's happening in tests

## Test Architecture

### E2E Tests with Playwright

Located in `/e2e/`, the test infrastructure includes:

- **Tab Transport Test App** (`e2e/test-app/`): A Vite + TypeScript application that demonstrates Tab Transport usage
- **React WebMCP Test App** (`e2e/react-webmcp-test-app/`): React application testing `useWebMCP` hooks and tool registration
- **Test Suites** (`e2e/tests/`): Playwright tests that validate transport behavior and React integration
- **Configuration**: Multiple Playwright configs for different test scenarios

### Test App Features

#### Tab Transport Test App (`e2e/test-app/`)

1. **MCP Server**: Implements a counter service with 4 tools:
   - `incrementCounter` - Increment counter by 1
   - `decrementCounter` - Decrement counter by 1
   - `resetCounter` - Reset counter to 0
   - `getCounter` - Get current counter value

2. **MCP Client**: Connects to the server in the same browser context using TabClientTransport

3. **Interactive UI**: Manual testing interface with:
   - Server start/stop controls
   - Client connect/disconnect controls
   - Tool execution buttons
   - Event log
   - Counter display

4. **Programmatic API**: Exposed `testApp` object for Playwright to control

#### React WebMCP Test App (`e2e/react-webmcp-test-app/`)

1. **Provider Component**: Demonstrates `useWebMCP` hook for tool registration
   - Registers tools via `navigator.modelContext`
   - State-aware tool execution
   - Component-scoped tool lifecycle

2. **Client Component**: Demonstrates MCP client consuming tools
   - Lists available tools
   - Calls tools via MCP protocol
   - Connection management

3. **Test Scenarios**: Validates React integration
   - Tool registration on component mount
   - Tool unregistration on component unmount
   - StrictMode compatibility
   - State management during tool execution

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
5. Upload test reports and screenshots

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

## Future Enhancements

### Unit Tests

Consider adding Vitest for unit testing individual transport methods:

```bash
pnpm add -D vitest @vitest/coverage-v8 -w
```

Benefits:
- Faster feedback loop
- Test edge cases without browser
- Measure code coverage

### Additional E2E Tests

Planned test scenarios:

- [ ] WebSocket transport testing
- [ ] Extension transport testing (requires Chrome extension setup)
- [ ] Multi-tab communication scenarios
- [ ] Error handling and recovery
- [ ] Performance benchmarks

### Visual Regression Testing

Add visual regression tests using Playwright's screenshot comparison:

```typescript
await expect(page).toHaveScreenshot('counter-view.png');
```

### Code Coverage

Integrate coverage reporting with Playwright:

```typescript
// In playwright.config.ts
use: {
  coverage: {
    enabled: true,
    provider: 'v8',
  },
}
```

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



If port 5173 is in use:

```bash
# Find and kill process
lsof -ti:5173 | xargs kill

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
- [E2E Test Suite README](./e2e/README.md)

## Contributing

When adding new transports or features:

1. Add corresponding E2E tests
2. Update test app if needed for new features
3. Ensure tests pass locally before pushing
4. Check CI results on PR

For questions or issues with testing, see [CONTRIBUTING.md](./CONTRIBUTING.md).
