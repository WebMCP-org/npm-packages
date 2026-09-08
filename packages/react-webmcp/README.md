# @mcp-b/react-webmcp

React tools with MCP output schemas and response formatting, plus prompts, resources, and clients.

```tsx
'use client';

import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

const calculatorInput = z.object({ left: z.number(), right: z.number() });

export function CalculatorTool() {
  useWebMCP({
    name: 'add_numbers',
    description: 'Add two numbers',
    inputSchema: calculatorInput,
    outputSchema: {
      type: 'object',
      properties: { total: { type: 'number' } },
      required: ['total'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute: ({ left, right }) => ({ total: left + right }),
  });

  return <p>The add_numbers tool is available to agents.</p>;
}
```

For `{ left: 3, right: 4 }`, local `execute()` returns `{ total: 7 }`; the agent receives
MCP text and `structuredContent`. Execution state is opt-in.

[API reference](https://docs.mcp-b.ai/packages/react-webmcp/reference) ·
[Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install

```bash
pnpm add @mcp-b/react-webmcp @mcp-b/global zod@^4.2
```

Import `@mcp-b/global` once in the client entry. Zod is optional; compatible schema libraries
and plain JSON Schema also work.

| API                                    | Runtime                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `useWebMCP`, `useWebMCPContext`        | Native WebMCP, initialized polyfill, or `@mcp-b/global` |
| `useWebMCPPrompt`, `useWebMCPResource` | `@mcp-b/global` or configured `BrowserMcpServer`        |
| `McpClientProvider`, `useMcpClient`    | Supplied MCP client and transport                       |

Native WebMCP and the standalone polyfill do not advertise MCP `outputSchema` metadata.
Use the MCP-B runtime to expose it to MCP clients.

## Performance

The tool hook measured **3.96 kB gzip**, one mount registration, and zero owner re-renders per
call without an execution-state subscription. React is excluded. See the
[Google/MCP Cat comparison](../usewebmcp/README.md#performance) and
[recorded measurements](https://github.com/WebMCP-org/npm-packages/blob/052f451e9353ea112093973b7e14a16f7715e7c7/benchmarks/react-hooks/PRODUCTION.md).

## Plugins and optional state

`useWebMCP` handles registration and local execution. Attach named plugins with
`plugins: [execution, consent({ broker })]`. For UI state, create an `executionState()` store
and subscribe with `useToolExecutionState()` only where it is displayed.
The [shared React example](../usewebmcp/README.md#subscribe-only-where-state-is-displayed)
works with this package's hook too.

[`@mcp-b/webmcp-plugins`](../webmcp-plugins/README.md) owns the runner, Standard Schema adapter,
consent, execution state, and OpenTelemetry. On managed MCP calls, input/output validation and
response classification happen inside that invocation. An MCP error response sets the optional
store's `error` and does not increase `executionCount`.

## Schemas and results

- `inputSchema: vendorSchema` calls the supplied converter and validator, including async transforms.
- Plain JSON Schema supplies metadata and inference only. Treat schemas as immutable.
- The result type is inferred from the handler. An `outputSchema` constrains it and is validated on MCP calls; local and native calls bypass that validation.
- Local execution and the optional store retain the raw value. Agent calls receive MCP formatting.
- `formatOutput` and `formatError` customize agent responses. Async formatters are awaited; local failures and cancellation always reject.

[Schema example](../usewebmcp/README.md#validate-input-with-your-schema-library) ·
[Schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output)

## Migration

Use the single `useWebMCP` tool hook; `useWebMCPTool` is removed. The return no longer includes
`state`, `reset`, or `isRegistered`. Use an `executionState()` plugin, explicit subscription,
and store `reset()` when needed. Replace `middleware` with named `plugins` and move plugin
imports from the removed polyfill entries to `@mcp-b/webmcp-plugins`.
Prompt and resource hooks retain `isRegistered`.

## Expose context, prompts, and resources

```ts
'use client';

import '@mcp-b/global';
import { useWebMCPContext, useWebMCPPrompt, useWebMCPResource } from '@mcp-b/react-webmcp';

export function PageTools({ title }: { title: string }) {
  useWebMCPContext('page_context', 'Get the current page title', () => ({ title }));

  useWebMCPPrompt({
    name: 'summarize_page',
    get: () => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Summarize: ${title}` } }],
    }),
  });

  useWebMCPResource({
    name: 'Page title',
    uri: 'page://title',
    read: async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/plain', text: title }],
    }),
  });

  return null;
}
```

These hooks use the latest committed props and clean up on unmount. Set `enabled: false`
to unregister. [Prompt and resource guide](https://docs.mcp-b.ai/how-to/register-prompts-and-resources).

## Consume an MCP server

Wrap your UI in `McpClientProvider`, supplying stable client and transport instances.
`useMcpClient()` exposes tools, resources, connection state, and errors.
[Client setup and example](https://docs.mcp-b.ai/packages/react-webmcp/reference#client-hooks).

## State and lifecycle

The tool hook returns `execute`, `isSupported`, and `registrationError`.
Execution state is available through an explicit plugin and subscription.
`isRegistered` was removed from tool hooks; use the runtime’s `getTools()` for discovery.
Prompt and resource hooks retain `isRegistered`.
Use `enabled: false` to unregister, and the handler's `{ signal }` for cancellation.
React 18/19, SSR, StrictMode, and `'use client'` are supported.

[Lifecycle reference](https://docs.mcp-b.ai/packages/usewebmcp/reference) ·
[Declarative form attributes](https://docs.mcp-b.ai/packages/react-webmcp/reference#declarative-form-attributes)

## Development

Run `pnpm build` then `pnpm test:hooks` from the repository root. [Harness details](../../docs/TESTING.md#react-hook-harness).

## License

[MIT](../../LICENSE)
