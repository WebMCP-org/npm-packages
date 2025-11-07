# Chromium Native API E2E Testing Guide

This guide explains how to run E2E tests for the Chromium-compatible `navigator.modelContext` and `navigator.modelContextTesting` APIs.

## Overview

The tests verify that the `@mcp-b/global` polyfill correctly implements:

### ModelContext APIs (Chromium-compatible)
- `unregisterTool(name: string)` - Unregister a tool by name
- `clearContext()` - Clear all registered tools

### ModelContextTesting APIs (Chromium-compatible)
- `executeTool(toolName: string, inputArgsJson: string)` - Execute a tool with JSON string input
- `listTools()` - List tools with inputSchema as JSON string
- `registerToolsChangedCallback(callback)` - Register callback for tool list changes

## Test Modes

The tests work in **two modes**:

### 1. Polyfill Mode (Default)
Tests run using the `@mcp-b/global` polyfill implementation.

```bash
# Run polyfill tests
cd e2e
pnpm playwright test chromium-native-api.spec.ts
```

### 2. Native Chromium Mode
Tests run using Chromium's native implementation of the Web Model Context API.

#### Enable Native API

**Option A: Launch with flag**
```bash
chromium --enable-experimental-web-platform-features
```

**Option B: Enable via chrome://flags**
1. Open `chrome://flags` in Chromium/Chrome
2. Search for "Experimental Web Platform Features"
3. Enable the flag
4. Restart the browser

#### Run Native Tests

```bash
# Run tests with native Chromium API
cd e2e
pnpm playwright test chromium-native-api.spec.ts --project=chromium \
  --launch-options='{"args":["--enable-experimental-web-platform-features"]}'
```

Or use the provided script:

```bash
# Add to package.json scripts
"test:chromium-native": "playwright test chromium-native-api.spec.ts --project=chromium --launch-options='{\"args\":[\"--enable-experimental-web-platform-features\"]}'"

# Run
pnpm test:chromium-native
```

## Test Structure

### Test Files
- `tests/chromium-native-api.spec.ts` - Main test file for Chromium-compatible APIs
- `test-app/src/main.ts` - Test app with UI handlers
- `test-app/index.html` - Test app HTML with buttons

### Test Suites

#### 1. ModelContext Tests
Tests for `navigator.modelContext` Chromium-compatible methods:

- **Method Availability**: Verify methods exist
- **unregisterTool()**: Test unregistering dynamic and base tools
- **clearContext()**: Test clearing all tools from both buckets
- **Error Handling**: Test graceful handling of non-existent tools

#### 2. ModelContextTesting Tests
Tests for `navigator.modelContextTesting` Chromium-compatible methods:

- **Method Availability**: Verify methods exist
- **executeTool()**: Test executing tools with JSON string input
  - Valid execution
  - Error handling (invalid JSON, non-existent tool)
- **listTools()**: Test listing tools with inputSchema as JSON string
  - Verify return type
  - Verify inputSchema format
- **registerToolsChangedCallback()**: Test callbacks fire on:
  - `registerTool()`
  - `unregisterTool()`
  - `provideContext()`
  - `clearContext()`
  - Multiple callbacks
  - Error handling in callbacks

#### 3. Integration Tests
Tests that verify APIs work together correctly:

- Combined executeTool + listTools
- Callbacks tracking all operations
- Full API specification compliance

## Running Tests

### All Tests
```bash
cd e2e
pnpm playwright test
```

### Chromium Native API Tests Only
```bash
cd e2e
pnpm playwright test chromium-native-api.spec.ts
```

### With UI Mode (Debug)
```bash
cd e2e
pnpm playwright test chromium-native-api.spec.ts --ui
```

### Watch Mode
```bash
cd e2e
pnpm playwright test chromium-native-api.spec.ts --watch
```

### Specific Test
```bash
cd e2e
pnpm playwright test -g "should executeTool with JSON string input"
```

## Manual Testing

### Start Test App
```bash
cd e2e
pnpm --filter mcp-tab-transport-test-app dev
```

### Open in Browser
1. Navigate to `http://localhost:5173`
2. Look for the "Chromium Native API Tests" section
3. Click test buttons to verify functionality

### Test Sequence

**Testing unregisterTool():**
1. Click "Register Dynamic Tool"
2. Click "Test unregisterTool()"
3. Verify log shows tool was unregistered

**Testing clearContext():**
1. Ensure tools are registered
2. Click "Test clearContext()"
3. Verify log shows all tools cleared

**Testing executeTool():**
1. Click "Test executeTool()"
2. Verify log shows successful execution with result

**Testing listTools():**
1. Click "Test listTools()"
2. Verify log shows:
   - Tool count
   - inputSchema is string: true
   - inputSchema is valid JSON ✅

**Testing Callbacks:**
1. Click "Test Callback: registerTool()"
2. Verify log shows "Callback fired on registerTool!"
3. Repeat for other callback tests

## Comparing Polyfill vs Native

To verify polyfill matches native implementation:

### 1. Run Polyfill Tests
```bash
pnpm playwright test chromium-native-api.spec.ts
```

### 2. Run Native Tests
```bash
pnpm playwright test chromium-native-api.spec.ts --launch-options='{"args":["--enable-experimental-web-platform-features"]}'
```

### 3. Compare Results
Both test runs should pass with identical results, proving the polyfill correctly implements the native API.

## Test Coverage

The test suite covers:

✅ **API Surface**
- All Chromium-compatible methods exist
- Correct method signatures
- Proper return types

✅ **Functionality**
- Methods work as specified
- Error handling matches Chromium behavior
- Edge cases handled correctly

✅ **Integration**
- APIs work together
- Callbacks fire at correct times
- State management works correctly

✅ **Compatibility**
- Polyfill behaves identically to native
- Both implementations pass same tests
- No breaking differences

## Chromium Source Reference

The polyfill implementation is based on Chromium's Web Model Context API specification:

**Chromium Test Files:**
- `blink/web_tests/external/wpt/model-context/execute-tool.html`
- `blink/web_tests/external/wpt/model-context/list-tools.html`
- `blink/web_tests/external/wpt/model-context/tools-changed-callback.html`

**Key Implementation Details:**

1. **executeTool** signature:
   ```typescript
   executeTool(toolName: string, inputArgsJson: string): Promise<any>
   ```
   - Takes JSON **string**, not object
   - Returns undefined on error
   - Throws SyntaxError on invalid JSON
   - Throws Error on non-existent tool

2. **listTools** signature:
   ```typescript
   listTools(): ToolInfo[]
   interface ToolInfo {
     name: string;
     description: string;
     inputSchema: string; // JSON string, not object!
   }
   ```
   - Returns array of ToolInfo
   - inputSchema is **string**, not object

3. **registerToolsChangedCallback** signature:
   ```typescript
   registerToolsChangedCallback(callback: () => void): void
   ```
   - Callback fires synchronously on tool changes
   - Supports multiple registered callbacks
   - Continues if one callback throws

## Troubleshooting

### Tests Failing in Native Mode
**Problem**: Tests fail when running with `--enable-experimental-web-platform-features`

**Solutions**:
1. Verify Chromium version supports the flag
2. Check flag is actually enabled: `chrome://version`
3. Try Chrome Canary for latest features

### executeTool Returns Wrong Value
**Problem**: `executeTool()` returns object instead of extracted value

**Check**:
- Polyfill extracts text from `content[0].text`
- Returns `structuredContent` if available
- Returns `undefined` on error

### Callbacks Not Firing
**Problem**: `registerToolsChangedCallback` doesn't trigger

**Check**:
- Testing API properly initialized
- Tool changes actually occurring
- Check browser console for errors
- Verify `notifyToolsChanged()` is called

### inputSchema Type Mismatch
**Problem**: `listTools()` returns inputSchema as object, not string

**Solution**:
- Use `testingAPI.listTools()`, not `modelContext.listTools()`
- Testing API stringifies inputSchema
- Model Context API returns object (by design)

## CI/CD Integration

Add to GitHub Actions:

```yaml
name: Chromium Native API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright
        run: pnpm exec playwright install --with-deps chromium

      - name: Run Polyfill Tests
        run: pnpm --filter e2e test:chromium-api

      - name: Run Native Tests (if supported)
        run: pnpm --filter e2e test:chromium-native
        continue-on-error: true  # Native API may not be available in CI
```

## Contributing

When adding new Chromium-compatible APIs:

1. **Add types** to `global/src/types.ts`
2. **Implement** in `global/src/global.ts`
3. **Add E2E tests** to `e2e/tests/chromium-native-api.spec.ts`
4. **Add UI handlers** to `e2e/test-app/src/main.ts`
5. **Add buttons** to `e2e/test-app/index.html`
6. **Update this README** with new test instructions

## Questions?

- Check Chromium source: [chromium.googlesource.com](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/web_tests/external/wpt/model-context/)
- Open issue: [GitHub Issues](https://github.com/WebMCP-org/npm-packages/issues)
- Review existing tests: `e2e/tests/chromium-native-api.spec.ts`
