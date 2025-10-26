# E2E Tests for MCP Tab Transports

This directory contains end-to-end tests for the `@mcp-b/transports` package using Playwright.

## Overview

The E2E test suite validates that the Tab Transport implementation works correctly in a real browser environment. It tests:

- **TabServerTransport**: Server-side transport for accepting MCP connections
- **TabClientTransport**: Client-side transport for connecting to MCP servers
- **Full MCP protocol**: Tool registration, listing, and execution
- **Connection lifecycle**: Connect, disconnect, reconnect scenarios

## Structure

```
e2e/
├── test-app/           # Test application using Tab Transports
│   ├── src/
│   │   └── main.ts     # MCP server & client implementation
│   ├── index.html      # Test UI
│   └── package.json
├── tests/
│   └── tab-transport.spec.ts  # Playwright E2E tests
├── playwright.config.ts
└── package.json
```

## Test Application

The test app (`test-app/`) is a simple Vite + TypeScript application that:

1. Creates an MCP server with counter tools (increment, decrement, reset, get)
2. Connects an MCP client to the server in the same browser context
3. Provides a UI for manually testing the transports
4. Exposes a `testApp` API for programmatic testing

## Running Tests

### From Root Directory

```bash
# Run all E2E tests
pnpm test

# Run with Playwright UI (recommended for development)
pnpm test:e2e:ui

# Run in headed mode (see browser)
pnpm test:e2e:headed

# Debug mode (step through tests)
pnpm test:e2e:debug
```

### From E2E Directory

```bash
cd e2e

# Run tests
pnpm test

# Open Playwright UI
pnpm test:ui

# Run in headed mode
pnpm test:headed

# Debug tests
pnpm test:debug

# View test report
pnpm test:report
```

## Test Scenarios

The test suite covers:

### Basic Functionality
- ✅ Load test application
- ✅ Start MCP server
- ✅ Connect MCP client to server
- ✅ List available tools

### Tool Execution
- ✅ Increment counter via MCP tool
- ✅ Decrement counter via MCP tool
- ✅ Reset counter via MCP tool
- ✅ Get counter value via MCP tool

### Advanced Scenarios
- ✅ Multiple rapid tool calls (concurrency)
- ✅ Disconnect and reconnect client
- ✅ Stop and restart server
- ✅ Programmatic API testing

## Manual Testing

You can also run the test app manually:

```bash
# Start the test app
pnpm --filter mcp-tab-transport-test-app dev

# Open http://localhost:5173 in your browser
```

Use the UI to:
1. Start the MCP server
2. Connect the client
3. List available tools
4. Execute counter operations
5. View the event log

## Debugging

### Playwright UI Mode

The best way to debug tests is using Playwright's UI mode:

```bash
pnpm test:e2e:ui
```

This provides:
- Visual test execution
- Time travel debugging
- DOM snapshots
- Network logs
- Console output

### Debug Mode

For step-by-step debugging:

```bash
pnpm test:e2e:debug
```

This opens Playwright Inspector where you can:
- Set breakpoints
- Step through tests
- Inspect selectors
- View page state

### Screenshots and Traces

Failed tests automatically capture:
- Screenshots (in `test-results/`)
- Traces (viewable in Playwright UI)

## CI/CD

Tests run automatically in GitHub Actions on:
- Pull requests to `main`
- Pushes to `main`

See `.github/workflows/e2e.yml` for CI configuration.

## Writing New Tests

Add new test files to `tests/` directory:

```typescript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    // Your test code
  });
});
```

## Browser Support

Currently testing on:
- ✅ Chromium (Chrome/Edge)

To add more browsers, update `playwright.config.ts`:

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
],
```

## Performance

Tests typically run in ~30-60 seconds for the full suite.

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE` errors, kill the process using port 5173:

```bash
lsof -ti:5173 | xargs kill
```

### Playwright Browsers Not Installed

```bash
pnpm --filter mcp-e2e-tests exec playwright install
```

### Tests Timing Out

Increase timeout in `playwright.config.ts`:

```typescript
timeout: 60000, // 60 seconds
```
