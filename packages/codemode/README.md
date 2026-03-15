# Codemode (Experimental)

`@mcp-b/codemode` is a browser-native codemode package inspired by Cloudflare's codemode work. It gives the model one tool that says "write code", turns your available tools into typed APIs, and runs that generated code inside a browser sandbox.

The default package ships with zero direct runtime dependencies. If you want AST-based code normalization, Acorn is available as an opt-in plugin entrypoint.

This package is especially useful on the client side with WebMCP tools.

> **Experimental**
> The API is still settling and may change in breaking ways.

## Installation

```sh
npm install @mcp-b/codemode ai zod
```

Optional Acorn-based normalization:

```sh
npm install @mcp-b/codemode acorn ai zod
```

## Recommended Browser Setup

For browser usage, prefer `IframeSandboxExecutor`.

- It gives you an iframe document boundary plus CSP.
- It fits client-side WebMCP better than the worker executor.
- It supports both a codemode-provisioned iframe and a caller-provided iframe.

## Quick Start With WebMCP

Today, the default WebMCP integration path is `navigator.modelContextTesting`.

```ts
import { IframeSandboxExecutor } from '@mcp-b/codemode';
import { streamText } from 'ai';
import { createCodeToolFromModelContextTesting } from '@mcp-b/codemode/webmcp';

const testing = navigator.modelContextTesting;

if (!testing) {
  throw new Error('navigator.modelContextTesting is unavailable');
}

const executor = new IframeSandboxExecutor({
  timeout: 30_000,
  csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';",
});

const codemode = createCodeToolFromModelContextTesting({
  modelContextTesting: testing,
  executor,
});

const result = streamText({
  model,
  system: 'You are a helpful assistant.',
  messages,
  tools: { codemode },
});
```

That helper does the whole bridge:

- reads tools from `modelContextTesting.listTools()`
- parses their JSON input schemas
- converts them into codemode descriptors
- wires execution through `modelContextTesting.executeTool(...)`
- returns a ready-to-use codemode AI SDK tool

## Optional Acorn Plugin

The built-in normalizer is intentionally lightweight and dependency-free. If you want AST-based normalization, opt into the Acorn entrypoint:

```ts
import { createCodeTool } from '@mcp-b/codemode/ai';
import { IframeSandboxExecutor } from '@mcp-b/codemode';
import { normalizeCodeWithAcorn } from '@mcp-b/codemode/acorn';

const codemode = createCodeTool({
  tools,
  executor: new IframeSandboxExecutor(),
  normalizeCode: normalizeCodeWithAcorn,
});
```

## Executors

### `IframeSandboxExecutor` (Preferred)

Use the built-in provisioned iframe:

```ts
import { IframeSandboxExecutor } from '@mcp-b/codemode';

const executor = new IframeSandboxExecutor({
  timeout: 30_000,
  csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';",
});
```

Or provide your own iframe:

```ts
import { IframeSandboxExecutor } from '@mcp-b/codemode';

const executor = new IframeSandboxExecutor({
  timeout: 30_000,
  targetOrigin: 'https://sandbox.example.com',
  iframeFactory: () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://sandbox.example.com/codemode-runtime.html';
    return iframe;
  },
});
```

If you provide your own iframe, you own the iframe's settings, origin, and loaded document. Codemode just uses it as the execution target.

### `WorkerSandboxExecutor`

```ts
import { WorkerSandboxExecutor } from '@mcp-b/codemode';

const executor = new WorkerSandboxExecutor({
  timeout: 30_000,
});
```

Use this when you specifically want a `Worker`-based browser sandbox. For WebMCP in the page, the iframe path is usually the better fit.

## Hosted Iframe Runtime

If you provide your own iframe, boot the runtime inside that iframe page:

```ts
import { initializeIframeSandboxRuntime } from '@mcp-b/codemode/browser';

initializeIframeSandboxRuntime({
  targetOrigin: 'https://app.example.com',
});
```

## WebMCP Utilities

If you need lower-level building blocks instead of the one-call helper, `@mcp-b/codemode/webmcp` also exports:

- `webmcpToolsToCodemode(...)`
- `modelContextTestingToCodemodeTools(...)`
- `createCodeToolFromModelContextTesting(...)`

## Current Limitations

- The WebMCP default path currently uses `navigator.modelContextTesting`
- `modelContextTesting.listTools()` exposes `inputSchema`, but not `outputSchema`
- That means codemode can infer input types from the testing API, but not output types
- Browser sandboxing is practical isolation, not a hardened VM
