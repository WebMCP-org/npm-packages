# Web Model Context API - Native Chromium Showcase

**A live, interactive demonstration of the native Web Model Context API
running in Chromium without any polyfills.**

![Native API Showcase](https://img.shields.io/badge/Native%20API-Chromium-4285F4?style=for-the-badge&logo=google-chrome)
![No Polyfill](https://img.shields.io/badge/Polyfill-NONE-success?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?style=for-the-badge&logo=typescript)

## Overview

This application is a **split-pane interactive playground** that
showcases the native Web Model Context API implementation in Chromium.
It demonstrates all API surfaces, the two-bucket tool management
system, and provides a live code editor for experimenting with tool
registration.

### Key Features

- **Live Code Editor** - Write and execute tool definitions in real time.
- **Split-pane UI** - Split-screen editor with live output.
- **Pre-built Templates** - Counter, Calculator, Todo, Timer, and
  State Machine examples.
- **Two-Bucket System** - Demonstrates `provideContext()` versus `registerTool()`.
- **Testing API Explorer** - Full access to `navigator.modelContextTesting` methods.
- **Event Log** - Real-time tracking of API operations.
- **Native-Only Validation** - Explicitly requires and validates native implementation.

---

## Quick Start

### Prerequisites

- **Chromium/Chrome** (version 120+ recommended)
- **Node.js** >= 22.12
- **pnpm** >= 10.0.0

### Installation

```bash
# From the e2e/web-standards-showcase directory
pnpm install

# Start development server
pnpm dev
```

Then open `http://localhost:5174` in Chromium with the experimental flag enabled.

### Running with Native API

The native Web Model Context API is an experimental Chromium feature
that must be explicitly enabled.

#### Option 1: Launch Chromium with Flags (Recommended)

```bash
# Linux/Mac
chromium --enable-experimental-web-platform-features http://localhost:5174

# Or using Chrome
google-chrome --enable-experimental-web-platform-features http://localhost:5174

# Windows
chrome.exe --enable-experimental-web-platform-features http://localhost:5174
```

#### Option 2: Enable via chrome://flags

1. Open Chromium/Chrome
2. Navigate to `chrome://flags`
3. Search for **"Experimental Web Platform Features"**
4. Set to **Enabled**
5. Click **Relaunch**
6. Navigate to `http://localhost:5174`

---

## User Guide

### Live Code Editor

The editor allows you to write tool definitions in JavaScript and
register them in real-time.

#### Basic Tool Template

```javascript
const tool = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'A parameter' }
    },
    required: ['param']
  },
  async execute(input) {
    // Your tool logic here
    return {
      content: [{
        type: 'text',
        text: `Result: ${input.param}`
      }]
    };
  }
};

// Register using provideContext (Bucket A - replaceable)
navigator.modelContext.provideContext({ tools: [tool] });

// OR register using registerTool (Bucket B - persistent)
navigator.modelContext.registerTool(tool);
```

#### Using Templates

The editor includes pre-built templates:

- **Counter** - Simple counter with increment operation
- **Calculator** - Math operations (add, multiply)
- **Todo** - Full CRUD todo list manager
- **Timer** - Start/stop/check timer with state
- **State Machine** - State transitions with history

Load a template from the dropdown, modify it, and click **▶ Register Tool**.

---

## API Demonstrations

### Two-Bucket Tool Management

The Web Model Context API uses a **two-bucket architecture** for managing tools:

#### Bucket A - `provideContext()`

- Tools registered via `provideContext({ tools: [...] })`
- **Completely replaced** when `provideContext()` is called again
- Ideal for dynamic tool sets that need full replacement
- Color-coded **blue** in the UI

**Example:**

```javascript
// First call - registers 3 tools
navigator.modelContext.provideContext({
  tools: [tool1, tool2, tool3]
});

// Second call - REPLACES all tools in Bucket A
navigator.modelContext.provideContext({
  tools: [tool4] // tool1, tool2, tool3 are now gone!
});
```

#### Bucket B - `registerTool()`

- Tools registered via `registerTool(tool)`
- **Persist across** `provideContext()` calls
- Must be individually unregistered via `unregister()` method
- Suitable for long-lived tools
- Color-coded **green** in the UI

**Example:**

```javascript
// Register a persistent tool
const registration = navigator.modelContext.registerTool(myTool);

// This tool will SURVIVE provideContext() calls!

// Later, when you want to remove it:
registration.unregister();
```

### Native Chromium Methods

These methods are **only available in the native Chromium
implementation** (not in polyfills):

#### `unregisterTool(name: string)`

Remove a specific tool by name from **any bucket**.

```javascript
navigator.modelContext.unregisterTool('counter_increment');
```

#### `clearContext()`

Remove **all tools from both buckets**.

```javascript
navigator.modelContext.clearContext(); // Everything is gone!
```

### Testing API (`navigator.modelContextTesting`)

Advanced testing features for debugging and development.

#### Key Differences from Main API

**Important:** The Testing API has subtle but critical differences:

- **`executeTool()`**
  - Main API: takes an object input, e.g. `{ key: value }`.
  - Testing API: takes a JSON string input, e.g. `'{"key":"value"}'`.
- **`listTools()`**
  - Main API: returns `inputSchema` as an object.
  - Testing API: returns `inputSchema` as a JSON string.
- **Return value behavior**
  - Main API: returns a result object.
  - Testing API: returns the string from `content[0].text`.

#### Testing API Methods

```javascript
// List tools (schemas are JSON strings!)
const tools = navigator.modelContextTesting.listTools();
tools.forEach(tool => {
  const schema = JSON.parse(tool.inputSchema); // Must parse!
});

// Execute tool (input must be JSON string!)
const result = await navigator.modelContextTesting.executeTool(
  'my_tool',
  JSON.stringify({ param: 'value' })
);

// Get execution history
const calls = navigator.modelContextTesting.getToolCalls();

// Clear history
navigator.modelContextTesting.clearToolCalls();

// Set mock response
navigator.modelContextTesting.setMockToolResponse('my_tool', 'mocked result');

// Remove mock
navigator.modelContextTesting.clearMockToolResponse('my_tool');

// Reset all testing state
navigator.modelContextTesting.reset();

// Register callback for tool changes
navigator.modelContextTesting.registerToolsChangedCallback(() => {
  console.log('Tools changed!');
});
```

---

## Modern Tooling Best Practices

When authoring tools in the live editor, prefer these patterns:

- **Use stable, action-first tool names** such as `search_products` or
  `create_ticket`.
- **Keep input schemas explicit and narrow** (required fields, clear types,
  and concise descriptions).
- **Return deterministic output** so clients can parse and validate results
  reliably.
- **Separate read and write tools** to reduce accidental destructive actions.
- **Follow least-privilege behavior** (only expose capabilities required for
  the immediate task).

---

## Testing

### Run E2E Tests

The showcase includes comprehensive Playwright tests that verify all functionality.

```bash
# From the e2e directory
pnpm test:native-showcase

# With UI mode
pnpm test:native-showcase:ui

# Debug mode
pnpm test:native-showcase:debug

# Headed mode (see browser)
pnpm test:native-showcase:headed
```

### Test Coverage

The test suite covers:

- Native API detection and validation
- Live code editor functionality
- Template loading and execution
- Two-bucket system behavior
- All native methods (listTools, executeTool, unregisterTool, clearContext)
- Testing API methods
- Tool executor with various inputs
- Event logging
- Error handling

---

## Architecture

### Project Structure

```text
web-standards-showcase/
├── src/
│   ├── main.ts              # Application entry point
│   ├── types.ts             # TypeScript type definitions
│   ├── api/
│   │   └── detection.ts     # Native API detection logic
│   ├── ui/
│   │   ├── eventLog.ts      # Event log UI manager
│   │   └── toolDisplay.ts   # Tool display UI manager
│   ├── examples/
│   │   └── templates.ts     # Pre-built tool templates
│   └── styles/
│       └── main.css         # Application styles
├── index.html               # Main HTML page
├── vite.config.ts          # Vite configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Tech Stack

- **Build Tool:** Vite 6
- **Language:** TypeScript 5.8+
- **Framework:** Vanilla TypeScript (framework-free)
- **Styling:** Modern CSS with custom properties
- **Testing:** Playwright
- **Module System:** ES Modules

### Design Philosophy

1. **No Polyfill** - Explicitly rejects polyfill implementations
2. **Zero Dependencies** - Pure web standards, no libraries
3. **Native First** - Showcases native browser capabilities
4. **Educational** - Clear demonstrations with explanations
5. **Interactive** - Live code editor for experimentation

---

## UI Components

### Status Banner

Shows the native API detection status:

- **Green (Success)** - Native API detected and ready
- **Yellow (Warning)** - Polyfill detected (app disabled)
- **Red (Error)** - API not available (app disabled)

### Code Editor Panel

- Syntax highlighting via CSS
- Template loading
- Real-time execution
- Error display

### Tools Output Panel

- Live tool registry display
- Color-coded buckets (blue=A, green=B)
- JSON schema display
- Tool descriptions

### Event Log

- Real-time event tracking
- Timestamped entries
- Color-coded event types
- Auto-scrolling

---

## Debugging

### Check API Availability

Open browser console and run:

```javascript
// Check if API is available
console.log('modelContext:', navigator.modelContext);
console.log('modelContextTesting:', navigator.modelContextTesting);

// Check if it's native (not polyfill)
console.log('Constructor:', navigator.modelContextTesting?.constructor.name);
// Should NOT contain "WebModelContext"

// List available methods
console.log('Methods:', Object.getOwnPropertyNames(
  Object.getPrototypeOf(navigator.modelContext)
));
```

### Common Issues

#### "navigator.modelContext not found"

**Solution:** You haven't enabled the experimental feature flag.

- Launch Chromium with `--enable-experimental-web-platform-features`
- Or enable in `chrome://flags`

#### "Polyfill detected"

**Solution:** Remove any polyfill imports from the page.

- Check for `@mcp-b/global` imports
- Ensure no other scripts are adding polyfills
- Hard refresh the page (Ctrl+Shift+R)

#### "Tools not appearing in output"

**Solution:** Check the event log and browser console for errors.

- Verify tool definition syntax
- Check for JavaScript errors
- Ensure `execute()` returns correct format

---

## Additional Resources

- **Chromium Source:** [blink/web_tests/external/wpt/model-context/](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/web_tests/external/wpt/model-context/)
- **CHROMIUM_FLAGS.md** - Detailed flag documentation
- **Main Project README** - [../../README.md](../../README.md)
- **E2E Testing Guide** - [../README.md](../README.md)

---

## Contributing

This is a demonstration app within the MCP-B monorepo.
For contribution guidelines, see the main project
[CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## License

MIT License - See [LICENSE](../../LICENSE) for details.

---

## Learning Resources

### Understanding the Two-Bucket System

The two-bucket architecture solves a common problem: how to manage
both **dynamic** (frequently changing) and **persistent** (long-lived)
tools in the same context.

**Real-world analogy:**

- **Bucket A (provideContext):** Like a whiteboard—erase everything
  and write new content.
- **Bucket B (registerTool):** Like sticky notes—they stay until you
  peel them off individually.

### When to Use Each Bucket

|Scenario|Use Bucket A|Use Bucket B|
|---|---|---|
|Tools that change together|Yes|No|
|Individual tool lifecycle|No|Yes|
|Page/context-specific tools|Yes|No|
|Cross-context persistent tools|No|Yes|
|Full replacement needed|Yes|No|
|Partial updates|No|Yes|

### Example: Chat Application with Tools

```javascript
// Bucket A: Message-specific tools (change with each message)
navigator.modelContext.provideContext({
  tools: [
    { name: 'edit_message', ... },
    { name: 'delete_message', ... },
    { name: 'reply_to_message', ... }
  ]
});

// Bucket B: App-wide tools (persistent across messages)
navigator.modelContext.registerTool({
  name: 'open_settings',
  description: 'Open app settings',
  ...
});

navigator.modelContext.registerTool({
  name: 'search_history',
  description: 'Search chat history',
  ...
});

// When user selects a different message:
// - Bucket A tools are REPLACED with new message tools
// - Bucket B tools (settings, search) REMAIN available
```

---

**Part of the [MCP-B Project](https://github.com/WebMCP-org/WebMCP).**
