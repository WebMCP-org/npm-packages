# @mcp-b/codemode

Codemode lets an LLM write and execute code that orchestrates your tools instead of calling them one at a time. Models write better tool-orchestration programs than tool-call chains — they have seen millions of lines of real TypeScript but only contrived tool-calling examples.

`@mcp-b/codemode` is a zero-dependency browser port of [Cloudflare's codemode](https://github.com/cloudflare/agents/blob/main/docs/codemode.md). It replaces Cloudflare Workers with iframe sandboxing and adds a WebMCP bridge that exposes page tools as codemode tools in one call.

> **New to codemode?** Read [Cloudflare's docs](https://github.com/cloudflare/agents/blob/main/docs/codemode.md) first — they cover the core idea, the [CodeAct paper](https://machinelearning.apple.com/research/codeact), and when codemode beats standard tool calling.

> **Experimental** — expect breaking changes.

## When to use codemode

Codemode helps when the model needs to:

- Chain multiple tool calls with logic between them
- Combine results from several tools before returning
- Work with many small WebMCP tools on the client
- Run multi-step workflows that would be awkward with plain tool calling

For single tool calls, standard AI SDK tool calling is simpler.

## How it differs from Cloudflare's

|                     | `@cloudflare/codemode`                  | `@mcp-b/codemode`                                                              |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| **Runtime**         | Cloudflare Workers                      | Any browser                                                                    |
| **Sandbox**         | `DynamicWorkerExecutor` (Worker Loader) | `IframeSandboxExecutor` (iframe + CSP) or `WorkerSandboxExecutor` (Web Worker) |
| **Dependencies**    | acorn, zod-to-ts                        | None required (acorn optional)                                                 |
| **Code normalizer** | acorn (built-in)                        | Regex (built-in), acorn (opt-in plugin)                                        |
| **WebMCP bridge**   | —                                       | One call exposes all page tools as codemode tools                              |
| **AI SDK**          | Required                                | Optional peer dependency                                                       |

## Installation

```sh
npm install @mcp-b/codemode ai zod
```

With AST normalization:

```sh
npm install acorn
```

All peer dependencies (`ai`, `zod`, `acorn`, `@mcp-b/webmcp-types`) are optional. Install what you use.

## Quick start: WebMCP

Expose every WebMCP tool on the page as a single codemode tool.

```ts
import { streamText } from 'ai';
import { IframeSandboxExecutor } from '@mcp-b/codemode';
import { createCodeToolFromModelContextTesting } from '@mcp-b/codemode/webmcp';

const testing = navigator.modelContextTesting;
if (!testing) throw new Error('modelContextTesting unavailable');

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

That helper reads tools from `modelContextTesting.listTools()`, converts their JSON Schema inputs into typed codemode descriptors, wires execution through `modelContextTesting.executeTool()`, and returns a single AI SDK tool.

When the model chooses codemode, it writes code like:

```js
async () => {
  const total = await codemode.sumNumbers({ a: 7, b: 5 });
  const greeting = await codemode.greetPerson({ name: 'WebMCP' });
  return { total, greeting };
};
```

That function runs in an iframe sandbox. Each `codemode.*` call routes back to host-side tools via `postMessage`.

## Quick start: standalone

Use codemode with AI SDK tools directly, no WebMCP required.

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { createCodeTool } from '@mcp-b/codemode/ai';
import { IframeSandboxExecutor } from '@mcp-b/codemode';

const tools = {
  getWeather: tool({
    description: 'Get weather for a location',
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => `Weather in ${location}: 72F, sunny`,
  }),
};

const codemode = createCodeTool({
  tools,
  executor: new IframeSandboxExecutor(),
});
```

Same `createCodeTool` API as upstream — different executor.

## Executors

Both implement the `Executor` interface:

```ts
interface Executor {
  execute(code: string, fns: ToolFunctions): Promise<ExecuteResult>;
}
```

### IframeSandboxExecutor (recommended)

Runs code in a hidden sandboxed iframe with CSP. Gives you a document boundary, which makes it the better default for in-page WebMCP.

Provisioned mode — codemode creates and manages the iframe:

```ts
import { IframeSandboxExecutor } from '@mcp-b/codemode';

const executor = new IframeSandboxExecutor({
  timeout: 30_000,
  csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval';",
});
```

Provided mode — you supply the iframe and control its origin, settings, and loaded document:

```ts
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

If you host your own iframe, initialize the runtime inside it:

```ts
import { initializeIframeSandboxRuntime } from '@mcp-b/codemode/browser';

initializeIframeSandboxRuntime({
  targetOrigin: 'https://app.example.com',
});
```

| Option          | Type                      | Default             | Description                                    |
| --------------- | ------------------------- | ------------------- | ---------------------------------------------- |
| `timeout`       | `number`                  | `30000`             | Execution timeout in ms                        |
| `csp`           | `string`                  | Restrictive default | Content Security Policy for provisioned iframe |
| `iframeFactory` | `() => HTMLIFrameElement` | —                   | Supply your own iframe                         |
| `targetOrigin`  | `string`                  | —                   | Required with `iframeFactory`                  |

### WorkerSandboxExecutor

Runs code in a Web Worker. Network APIs are scrubbed from the global scope before user code runs.

```ts
import { WorkerSandboxExecutor } from '@mcp-b/codemode';

const executor = new WorkerSandboxExecutor({ timeout: 30_000 });
```

## Optional: acorn normalizer

The built-in normalizer is regex-based and dependency-free. It handles code fences, `export default`, named functions, and arrow functions.

For AST-based normalization, install acorn and pass the normalizer to `createCodeTool`:

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

The normalizer is pluggable — any `(code: string) => string` function works.

## WebMCP utilities

`@mcp-b/codemode/webmcp` exports three functions at different abstraction levels:

| Function                                         | What it does                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `createCodeToolFromModelContextTesting(options)` | Reads tools, builds descriptors, returns an AI SDK tool                      |
| `modelContextTestingToCodemodeTools(testing)`    | Converts `modelContextTesting` into executable codemode descriptors          |
| `webmcpToolsToCodemode(tools)`                   | Converts `ToolListItem[]` into JSON Schema descriptors (no execute handlers) |

Use the lower-level functions to filter tools, modify descriptors, or wire execution differently.

## Entry points

| Import                    | Provides                                                                            | Peer deps                          |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `@mcp-b/codemode`         | `IframeSandboxExecutor`, `WorkerSandboxExecutor`, `normalizeCode`, types, utilities | None                               |
| `@mcp-b/codemode/ai`      | `createCodeTool`, `generateTypes`                                                   | `ai`, `zod`                        |
| `@mcp-b/codemode/browser` | Same as default (explicit zero-dep entry)                                           | None                               |
| `@mcp-b/codemode/acorn`   | `normalizeCodeWithAcorn`                                                            | `acorn`                            |
| `@mcp-b/codemode/webmcp`  | WebMCP bridge functions                                                             | `ai`, `zod`, `@mcp-b/webmcp-types` |

## API reference

### `createCodeTool(options)`

Returns an AI SDK `Tool`. Import from `@mcp-b/codemode/ai`.

| Option          | Type                                                                | Default        | Description                                              |
| --------------- | ------------------------------------------------------------------- | -------------- | -------------------------------------------------------- |
| `tools`         | `ToolSet \| ToolDescriptors \| JsonSchemaExecutableToolDescriptors` | required       | Your tools                                               |
| `executor`      | `Executor`                                                          | required       | Sandbox for generated code                               |
| `description`   | `string`                                                            | auto-generated | Custom description (`{{types}}` replaced with type defs) |
| `normalizeCode` | `(code: string) => string`                                          | built-in regex | Code normalizer                                          |

### `createCodeToolFromModelContextTesting(options)`

Returns an AI SDK `Tool`. Import from `@mcp-b/codemode/webmcp`.

| Option                | Type                                                      | Default        | Description                |
| --------------------- | --------------------------------------------------------- | -------------- | -------------------------- |
| `modelContextTesting` | `Pick<ModelContextTesting, 'listTools' \| 'executeTool'>` | required       | The testing API            |
| `executor`            | `Executor`                                                | required       | Sandbox for generated code |
| `description`         | `string`                                                  | auto-generated | Custom description         |
| `normalizeCode`       | `(code: string) => string`                                | built-in regex | Code normalizer            |

### `generateTypes(tools)`

Returns TypeScript type definitions from your tools. Used internally by `createCodeTool` but exported for displaying available tools in a UI.

### `sanitizeToolName(name)`

Converts tool names into valid JavaScript identifiers: `get-weather` becomes `get_weather`, `3d-render` becomes `_3d_render`.

## Current limitations

- `modelContextTesting` exposes `inputSchema` but not always `outputSchema` — output types default to `unknown`
- Browser sandboxing (iframe `sandbox` + CSP, or Worker global scrubbing) provides practical isolation, not a hardened VM
- JavaScript execution only
