# React WebMCP Test App

A comprehensive React application for testing the `@mcp-b/react-webmcp` package with Playwright E2E tests.

## Overview

This test app demonstrates and validates all features of the `@mcp-b/react-webmcp` hooks library:

- **Tool Registration** - 7 different MCP tools with various configurations
- **State Management** - Execution tracking, error handling, and result management
- **React StrictMode** - Validates duplicate registration prevention
- **Type Safety** - Zod schema validation for inputs
- **Real MCP Stack** - Uses real `@mcp-b/global`, `@mcp-b/transports`, and MCP SDK

## Features Tested

### Counter Tools (Mutation & Query)
- `counter_increment` - Increment counter (mutation, non-idempotent)
- `counter_decrement` - Decrement counter (mutation, non-idempotent)
- `counter_reset` - Reset to zero (destructive operation with elicitation)
- `counter_get` - Get current value (read-only, idempotent query)

### Posts Tools (Complex Operations)
- `posts_like` - Like a post by ID (mutation, idempotent)
- `posts_search` - Search posts with filtering (read-only query)

### Context Tool
- `context_app_state` - Expose current app state (read-only context)

## Running the App

### Development Server
```bash
pnpm --filter react-webmcp-test-app dev
```

The app will be available at http://localhost:5174

### Build
```bash
pnpm --filter react-webmcp-test-app build
```

## Running Tests

### Run all React WebMCP tests
```bash
pnpm --filter mcp-e2e-tests test:react-webmcp
```

### Run with UI
```bash
pnpm --filter mcp-e2e-tests test:react-webmcp:ui
```

### Run in headed mode (see the browser)
```bash
pnpm --filter mcp-e2e-tests test:react-webmcp:headed
```

### Debug mode
```bash
pnpm --filter mcp-e2e-tests test:react-webmcp:debug
```

## Test Coverage

The Playwright test suite includes 18 comprehensive tests:

1. **Initialization Tests**
   - App loads and initializes MCP
   - All tools are registered on mount

2. **Counter Operation Tests**
   - Increment counter via button
   - Decrement counter via button
   - Reset counter via button
   - Get counter value via button

3. **Posts Operation Tests**
   - Like a post via button
   - Search posts via button
   - Update total likes when posts are liked

4. **Direct MCP API Tests**
   - Call tool directly via MCP API
   - List all registered tools
   - Call context tool and get app state

5. **State Management Tests**
   - Handle multiple rapid clicks
   - Track execution counts correctly
   - Maintain state across multiple operations

6. **Error Handling Tests**
   - Handle tool validation errors

7. **UI Interaction Tests**
   - Clear event log

8. **React StrictMode Tests**
   - Handle StrictMode double-mounting correctly

## Real MCP Implementation

The test app uses the **complete real MCP stack** for true end-to-end testing:

### Architecture Flow

1. **Tool Registration**: `useWebMCP()` hooks register tools with `navigator.modelContext` (provided by `@mcp-b/global`)
2. **MCP Server**: `@mcp-b/global` creates a real MCP server that handles tool execution
3. **Transport Layer**: `TabClientTransport` from `@mcp-b/transports` connects client to server via browser tab messaging
4. **MCP Client**: Real `@modelcontextprotocol/sdk` Client instance connects to the server
5. **Tool Consumption**: `useMcpClient()` hook provides access to call tools via the real MCP protocol

This is **not a mock** - it uses the actual workspace packages and real MCP protocol messages over real browser postMessage APIs.

## Architecture

```
src/
├── App.tsx             # Main React component with all tool implementations
├── ClientConsumer.tsx  # Component that consumes tools via MCP client
├── main.tsx            # React app entry point + MCP client setup
└── testMiddleware.ts   # Optional middleware for observing MCP events
```

## Key Test Patterns

### Testing Tool Registration
```typescript
const tools = await page.evaluate(() => {
  return (window as any).mcpTools;
});
expect(tools).toContain('counter_increment');
```

### Testing Tool Execution via Real MCP Client
```typescript
const result = await page.evaluate(async () => {
  return await (window as any).mcpClient.callTool({
    name: 'counter_increment',
    arguments: { amount: 5 }
  });
});
expect(result.content).toBeDefined();
```

### Testing UI State
```typescript
const counter = page.locator('[data-testid="counter-display"]');
await expect(counter).toContainText('5');
```

## Development

The test app uses:

- **React 19** with StrictMode
- **Vite** for fast development
- **TypeScript** for type safety
- **Zod** for runtime validation
- **@mcp-b/react-webmcp** for MCP tool registration (real package from workspace)
- **@mcp-b/global** for navigator.modelContext polyfill (real package from workspace)
- **@mcp-b/transports** for TabClientTransport (real package from workspace)
- **@modelcontextprotocol/sdk** for MCP Client (real SDK)

## Notes

- All tests run in headless Chromium by default
- The dev server starts automatically when running tests
- Tests include screenshots on failure for debugging
- HTML reports are generated after each test run
