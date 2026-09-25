# @mcp-b/react-webmcp

React hooks for WebMCP tools with MCP output schemas, prompts, resources, and client connections.

```tsx
'use client';

import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

const calculatorInput = z.object({ left: z.number(), right: z.number() });

export function CalculatorTool() {
  const tool = useWebMCP({
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

  return <output>Last total: {tool.state.lastResult?.total ?? 'Not called yet'}</output>;
}
```

For `{ left: 3, right: 4 }`, React state holds `{ total: 7 }`; the agent receives MCP text and `structuredContent`.

[API reference](https://docs.mcp-b.ai/packages/react-webmcp/reference) · [Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install

```bash
pnpm add @mcp-b/react-webmcp @mcp-b/global zod@^4.2
```

Import `@mcp-b/global` once in your client entry. Zod is optional; compatible schema libraries and plain JSON Schema also work.

| What you use                             | Runtime needed                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `useWebMCP` or `useWebMCPContext`        | Native WebMCP, an initialized polyfill, or `@mcp-b/global`         |
| `useWebMCPPrompt` or `useWebMCPResource` | `@mcp-b/global` or a configured `BrowserMcpServer`                 |
| `McpClientProvider` and `useMcpClient`   | Your MCP client and transport; no `document.modelContext` required |

Native WebMCP and the standalone polyfill do not advertise MCP `outputSchema` metadata. Use the MCP-B runtime to expose that metadata to MCP clients.

## Compare hooks

Use `usewebmcp` for raw browser tools. This package adds MCP responses, prompts, resources,
and client hooks. Both share registration, validation, execution state, and cancellation.

[Performance comparison](https://docs.mcp-b.ai/packages/usewebmcp/overview#performance-comparison) ·
[Feature matrix](https://docs.mcp-b.ai/packages/usewebmcp/overview#feature-comparison)

## Schemas and results

- The hook calls your schema's converter and supplied validator, including async transforms. It ships no validator.
- Plain JSON Schema supplies metadata and inference only. Reuse immutable schemas to cache conversion and serialization.
- `outputSchema` types the result. The MCP server validates it on MCP calls; local and native calls bypass that validation.
- Local execution and React state retain your value. Agent calls receive MCP formatting; `formatOutput` can override it.
- `formatError` defaults to an MCP response with `isError: true`. Async formatters are awaited; local failures and cancellation always reject.

[Input example](../usewebmcp/README.md#validate-input-with-your-schema-library) ·
[Schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output) ·
[Output reference](https://docs.mcp-b.ai/packages/react-webmcp/reference#schema-compatibility)

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

The tool hook returns `state`, `execute`, `reset`, `isSupported`, and `registrationError`.
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
