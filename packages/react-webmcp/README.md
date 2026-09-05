# @mcp-b/react-webmcp

React hooks for WebMCP tools with MCP output schemas, prompts, resources, and client connections.

```tsx
'use client';

import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

export function CalculatorTool() {
  const tool = useWebMCP({
    name: 'add_numbers',
    description: 'Add two numbers',
    inputSchema: z.object({ left: z.number(), right: z.number() }),
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

With arguments `{ left: 3, right: 4 }`, the handler and React state hold `{ total: 7 }`. The agent receives an MCP response:

```json
{
  "content": [{ "type": "text", "text": "{\"total\":7}" }],
  "structuredContent": { "total": 7 },
  "isError": false
}
```

[API reference](https://docs.mcp-b.ai/packages/react-webmcp/reference) · [Framework setup](https://docs.mcp-b.ai/how-to/frameworks)

## Install

In a React 18 or 19 application, install the packages used above:

```bash
pnpm add @mcp-b/react-webmcp @mcp-b/global zod@^4.2
```

Import `@mcp-b/global` once in your client entry to install the MCP-B runtime. Zod is optional: use your existing compatible schema library or plain JSON Schema instead.

| What you use                             | Runtime needed                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `useWebMCP` or `useWebMCPContext`        | Native WebMCP, an initialized polyfill, or `@mcp-b/global`         |
| `useWebMCPPrompt` or `useWebMCPResource` | `@mcp-b/global` or a configured `BrowserMcpServer`                 |
| `McpClientProvider` and `useMcpClient`   | Your MCP client and transport; no `document.modelContext` required |

Native WebMCP and the standalone polyfill do not advertise MCP `outputSchema` metadata. Use the MCP-B runtime to expose that metadata to MCP clients.

## Choose between the two tool hooks

| Feature                                                  | `usewebmcp`             | `@mcp-b/react-webmcp`                      |
| -------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| React lifecycle, state, cancellation, and `'use client'` | Yes                     | Shared core implementation                 |
| JSON Schema input inference                              | Upstream `webmcp-types` | Shared core implementation                 |
| Standard Schema validation and transforms                | Yes                     | Shared core implementation                 |
| Default successful agent result                          | Your raw value          | MCP `content` and JSON `structuredContent` |
| `outputSchema` and MCP annotations                       |                         | Yes                                        |
| Context, prompt, resource, and MCP client hooks          |                         | Yes                                        |

Choose [`usewebmcp`](../usewebmcp/README.md) when you need browser tools with raw results. Choose this package when you need MCP formatting or the additional hooks. Both accept the same Standard Schema inputs.

## Input validation uses your schema

`useWebMCP` delegates conversion and validation to the shared `usewebmcp` hook:

1. `schema['~standard'].jsonSchema.input()` produces the browser's JSON Schema metadata.
2. `schema['~standard'].validate(input)` validates each local or agent call, when supplied.
3. Your handler receives the validated value, including transforms and defaults.

The validator comes from your schema library. The hook does not implement a second validator. Async validation is awaited, and invalid input never reaches your handler. The hook forwards plain JSON metadata so the MCP SDK does not run the same vendor transforms a second time.

Standard Schema validation and Standard JSON Schema conversion are separate interfaces. Converter-only schemas provide metadata without validation; validator-only schemas also need a converter for registration. Plain JSON Schema is supported but does not add hook-level validation.

For a complete transform example, see the [core hook README](../usewebmcp/README.md#validate-input-with-your-schema-library). The [schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output) covers direct polyfill and SDK usage.

## Output schemas and formatting

`outputSchema` is a JSON Schema object that constrains the handler's return type and types `state.lastResult`. It is an MCP-B extension. It is separate from a schema library's transformed _input_ type.

The hook checks that schema-backed results are JSON-serializable. It does not validate them against `outputSchema`. The official MCP server validates output on MCP calls; native and direct browser calls do not pass through that validation.

Existing MCP responses pass through unchanged. Other JSON values become text and `structuredContent`, even without an `outputSchema`. `formatOutput(result)` overrides agent formatting while local execution and state retain the handler's value. Thrown or returned errors produce an `isError` response; local calls reject.

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

The hooks publish the latest committed props and clean up their registrations on unmount. Context uses a read-only tool. Prompts and resources use the MCP-B runtime; see [register prompts and resources](https://docs.mcp-b.ai/how-to/register-prompts-and-resources).

Prompts and resources accept `enabled: false` to remove their registration. Context tools accept it in a fourth `{ enabled }` argument. Re-enabling uses the latest committed configuration.

## Consume an MCP server

Pass stable client and transport instances from your browser setup into the provider:

```tsx
'use client';

import { McpClientProvider, useMcpClient, type McpClientProviderProps } from '@mcp-b/react-webmcp';

export function ToolBrowser({
  client,
  transport,
}: Pick<McpClientProviderProps, 'client' | 'transport'>) {
  return (
    <McpClientProvider client={client} transport={transport}>
      <ToolList />
    </McpClientProvider>
  );
}

function ToolList() {
  const { tools, isConnected, error } = useMcpClient();
  if (error) return <p role="alert">{error.message}</p>;
  if (!isConnected) return <p>Connecting…</p>;
  return (
    <ul>
      {tools.map((tool) => (
        <li key={tool.name}>{tool.name}</li>
      ))}
    </ul>
  );
}
```

The provider connects and cleans up the client, and refreshes its tool and resource inventory. It does not need `@mcp-b/global`. Keep browser-global reads such as `window.location.origin` in client setup, not at module scope in server-rendered components.

`reconnect()` refreshes discovery while connected. After a one-shot transport closes, pass a fresh transport to `reconnect(newTransport)`. See the [client reference](https://docs.mcp-b.ai/packages/react-webmcp/reference#client-hooks) for transport setup and tool calls.

## State and lifecycle

`useWebMCP` returns `state`, `execute`, `reset`, `isSupported`, `isRegistered`, and `registrationError`. Set `enabled: false` to unregister a tool while retaining local execution. Handlers receive `(input, { signal })` for cancellation.

Metadata changes update registration automatically. Equivalent inline schemas do not re-register; optional `deps` can force a refresh. Shared behavior, including StrictMode and server rendering, is documented in the [core hook reference](https://docs.mcp-b.ai/packages/usewebmcp/reference).

Importing this package also adds React JSX declarations for declarative WebMCP form attributes. Use `toolautosubmit=""`, as shown in the [form reference](https://docs.mcp-b.ai/packages/react-webmcp/reference#declarative-form-attributes).

## Development

After `pnpm build` at the repository root, run `pnpm test:hooks`. The [harness](../../docs/TESTING.md#react-hook-harness) checks both hook packages in real browsers and packed React 18/19 consumers, including server rendering and preserved client directives.

## License

[MIT](../../LICENSE)
