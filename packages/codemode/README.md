# Codemode (Experimental)

Codemode lets an LLM write and execute code that orchestrates your tools instead of calling them one at a time. This works well because models are generally better at writing small programs than planning long tool-call chains step by step.

`@mcp-b/codemode` is the browser-native version of that idea. It is heavily inspired by Cloudflare's codemode work, but built for browser runtimes, iframe isolation, and client-side WebMCP.

The default package has zero direct runtime dependencies. If you want AST-based code normalization, you can opt into Acorn as a plugin.

> Experimental: this package may change in breaking ways.

## When to use Codemode

Codemode is most useful when the model needs to:

- chain multiple tool calls with logic between them
- combine results from several tools before returning
- work with many small WebMCP tools on the client
- run multi-step workflows that would be awkward with plain tool calling

For simple, single tool calls, standard AI SDK tool calling is usually simpler.

## Installation

Default install:

```sh
npm install @mcp-b/codemode ai zod
```

Optional Acorn plugin:

```sh
npm install @mcp-b/codemode acorn ai zod
```

## Quick Start With WebMCP

Today, the default WebMCP integration path is `navigator.modelContextTesting`.

```ts
import { streamText } from 'ai';
import { IframeSandboxExecutor } from '@mcp-b/codemode';
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

That helper:

- reads tools from `modelContextTesting.listTools()`
- parses JSON input schemas
- converts them into codemode descriptors
- wires execution through `modelContextTesting.executeTool(...)`
- returns a single codemode tool you can hand to AI SDK

When the model chooses codemode, it writes an async arrow function like:

```javascript
async () => {
  const total = await codemode.sumNumbers({ a: 7, b: 5 });
  const greeting = await codemode.greetPerson({ name: 'WebMCP' });

  return {
    total,
    greeting,
  };
};
```

Codemode executes that function in a browser sandbox and routes `codemode.*` calls back to your host tools.

## Recommended Executor

For browser usage, prefer `IframeSandboxExecutor`.

- It gives you a document boundary plus CSP.
- It fits client-side WebMCP better than the worker executor.
- It supports both a provisioned iframe and a caller-provided iframe.

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

If you provide your own iframe, you own the iframe settings, origin, and loaded document. Codemode only uses it as the execution target.

If you host your own iframe runtime, initialize it inside the iframe page:

```ts
import { initializeIframeSandboxRuntime } from '@mcp-b/codemode/browser';

initializeIframeSandboxRuntime({
  targetOrigin: 'https://app.example.com',
});
```

## Worker Executor

`WorkerSandboxExecutor` is also available:

```ts
import { WorkerSandboxExecutor } from '@mcp-b/codemode';

const executor = new WorkerSandboxExecutor({
  timeout: 30_000,
});
```

Use it when you specifically want a `Worker` sandbox. For in-page WebMCP, the iframe path is usually the better fit.

## Optional Acorn Plugin

The built-in normalizer is intentionally lightweight and dependency-free. If you want AST-based normalization, opt into the Acorn entrypoint and pass it to `createCodeTool`.

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

## Lower-Level WebMCP Utilities

If you want building blocks instead of the one-call helper, `@mcp-b/codemode/webmcp` also exports:

- `webmcpToolsToCodemode(...)`
- `modelContextTestingToCodemodeTools(...)`
- `createCodeToolFromModelContextTesting(...)`

## Current Limitations

- The default WebMCP path currently uses `navigator.modelContextTesting`
- `modelContextTesting.listTools()` exposes `inputSchema`, but not `outputSchema`
- That means codemode can infer input types from the testing API, but not output types
- Browser sandboxing is practical isolation, not a hardened VM
