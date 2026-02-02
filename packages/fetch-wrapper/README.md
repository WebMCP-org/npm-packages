# @mcp-b/fetch-wrapper

Fetch wrapper that proxies requests through an MCP tool so iframe apps can call backend logic via the host.

## Installation

```bash
pnpm add @mcp-b/fetch-wrapper
```

## Usage

```ts
import { Client } from '@mcp-b/webmcp-ts-sdk';
import { createHttpRequestTool, createMcpFetch, initMcpFetch } from '@mcp-b/fetch-wrapper';

const client = new Client({ name: 'app', version: '1.0.0' });
// Connect client to your MCP transport before using.

// Option 1: wrap a fetch function
const mcpFetch = createMcpFetch(client);
const response = await mcpFetch('/api/time');

// Option 2: patch global fetch
const restore = initMcpFetch(client);
await fetch('/api/time');
restore();
```

## Server Tool Helper

```ts
import { createHttpRequestTool } from '@mcp-b/fetch-wrapper';

const httpRequestTool = createHttpRequestTool(async (request) => {
  if (request.url.endsWith('/api/time')) {
    return { status: 200, headers: { 'content-type': 'application/json' }, body: { time: Date.now() }, bodyType: 'json' };
  }
  return { status: 404, headers: { 'content-type': 'application/json' }, body: { error: 'Not found' }, bodyType: 'json' };
});

// register httpRequestTool as your MCP tool handler for `http_request`
```

## Tool Contract

The wrapper expects a tool named `http_request` (configurable via `toolName`) that accepts a Fetch-aligned payload and returns a structured response.

See `src/types.ts` for the exact schema and body serialization rules.
