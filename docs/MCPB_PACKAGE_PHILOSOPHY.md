# MCP-B package philosophy

Browser compatibility, invocation behavior, React subscriptions, and MCP transport have separate
owners. This keeps tools usable with native WebMCP as the Community Group proposal evolves.

## Package boundaries

| Package                  | Owns                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `webmcp-types`           | Upstream browser contracts and `document.modelContext` declarations        |
| `@mcp-b/webmcp-types`    | Derived MCP-B extensions, descriptor helpers, and compatibility types      |
| `@mcp-b/webmcp-polyfill` | Browser fallback, declarative behavior, and compatibility helpers          |
| `@mcp-b/webmcp-plugins`  | Shared invocation runner, Standard Schema adapter, consent, state, tracing |
| `usewebmcp`              | React registration lifetime and explicit execution-state subscription      |
| `@mcp-b/react-webmcp`    | MCP result formatting/output metadata, prompt/resource hooks, and clients  |
| `@mcp-b/webmcp-ts-sdk`   | BrowserMcpServer and the official MCP server bridge                        |
| `@mcp-b/global`          | Runtime initialization and transport orchestration                         |

The polyfill does not depend on plugins. Core hooks depend on the plugin runner and upstream
types, without installing a fallback or MCP bridge. The SDK uses both browser compatibility
helpers and the shared plugin runtime.

## One invocation owner

The plugin runner captures the handler, input, and tool identity for each call. It validates and
transforms input once, then exposes immutable prepared arguments to consent. Named plugins wrap
the invocation for approval, observation, or tracing. A plugin list cannot reorder validation
after approval or invoke its continuation twice.

React keeps `inputSchema: vendorSchema` as its ergonomic API. Direct callbacks use
`input: standardSchema(schema)`. Both call the vendor's supplied validator; no validation engine
is bundled. Plain JSON Schema remains metadata and type inference unless another validator is
explicitly supplied.

Keep one runner module instance across the hook and MCP bridge. Managed callback ownership and
trusted adapter context use module-local identity. Bundling a private copy into either consumer
would lose that identity. The SDK places its protocol validation inside managed invocations,
so observers see validation failures without repeating vendor transformations.

## Registration and observation

There is one tool hook: `useWebMCP`. It returns local `execute`, `isSupported`, and
`registrationError`. It neither allocates nor subscribes to execution state.

An `executionState()` plugin records calls even without subscribers. `useToolExecutionState()`
subscribes only the component displaying its snapshot. The store owns `reset()` and its lifetime;
unsubscribing does not erase state or cancel work. This makes call-driven renders an explicit UI
choice instead of a registration side effect.

## Contribution rules

1. Keep browser globals aligned with upstream types. MCP-only methods belong to `BrowserMcpServer`.
2. Keep runtime initialization in `@mcp-b/global`/the polyfill and invocation extensions in the plugin package.
3. Preserve one validation owner and one managed callback across native, React, and MCP entry points.
4. Keep MCP formatting/output metadata in the adapter, and preserve raw local values.
5. Consent covers wrapped calls only. Application servers must authorize protected operations;
   same-page plugins do not authenticate callers or secure endpoints that bypass the wrapper.
6. Put shared types in their owning package; avoid compatibility barrels and duplicate contracts.

## Hard cutover

The former polyfill plugin entries, `middleware` option, `useWebMCPTool`, and implicit hook
`state`/`reset` are removed without aliases. Use named `plugins`, `executionState()`,
`consent({ broker })`, and `otel(options)`. The
[plugin reference](../packages/webmcp-plugins/README.md) and
[React migration](../packages/usewebmcp/README.md#migration) describe the supported API.
