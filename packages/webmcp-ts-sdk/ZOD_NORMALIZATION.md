# Schema Normalization in `BrowserMcpServer`

## Goal

`BrowserMcpServer` is the MCP-B runtime layer that normalizes JSON-exportable schemas before registration reaches:

- the wrapped native or polyfilled `navigator.modelContext`
- the parent MCP TypeScript SDK server

This keeps direct `@mcp-b/global` usage, `react-webmcp`, and lower-level SDK registration on one standards-first contract.

## What Problem This Solves

Before this change:

- `react-webmcp` carried MCP-B-specific Zod conversion logic
- direct `navigator.modelContext.registerTool(...)` through `@mcp-b/global` behaved differently
- MCP transport-facing APIs needed JSON Schema, but validation-only Standard Schema objects were mixed into registration paths
- the parent MCP SDK mutates plain object schemas if they are handed to `super.registerTool(...)` without protection

The result was inconsistent runtime behavior and blurry boundaries between validation concerns and transport concerns.

## High-Level Flow

### Tool registration

When `BrowserMcpServer.registerTool(tool)` is called:

1. `normalizeToolDescriptorSchemas(tool)` runs first.
2. `normalizeSchemaForRegistration(...)` checks `inputSchema` and `outputSchema`.
3. If a schema is:
   - plain JSON Schema, it is passed through
   - `StandardJSONSchemaV1`, it is exported via `~standard.jsonSchema.input/output(...)`
   - validator-only `StandardSchemaV1`, registration is rejected because MCP surfaces require JSON Schema export
4. The normalized descriptor is mirrored to `native.registerTool(...)`.
5. The normalized descriptor is then passed into `registerToolInServer(...)`.
6. `registerToolInServer(...)` converts the normalized schemas into transport-safe JSON Schema with `toTransportSchema(...)` before calling `super.registerTool(...)`.

### Prompt registration

`registerPrompt(...)` uses the same idea for `argsSchema`:

1. normalize JSON-exportable schema if present
2. convert to transport JSON Schema
3. store that schema locally for prompt validation and listing
4. avoid giving mutable plain JSON Schema back to the parent SDK path without transport normalization

## Detection Rules

The runtime helper in [`schema-utils.ts`](./src/schema-utils.ts) uses three simple checks:

- plain JSON Schema objects: pass through
- `StandardJSONSchemaV1`: export to JSON Schema using `draft-2020-12`, then `draft-07`
- validator-only `StandardSchemaV1`: reject on registration surfaces

`$schema` metadata is stripped after conversion so mirrored and listed schemas stay transport-safe and stable.

## Conversion Strategy

For `StandardJSONSchemaV1`:

1. try `draft-2020-12`
2. fall back to `draft-07`
3. strip `$schema` metadata from the exported JSON Schema

For validator-only `StandardSchemaV1`:

1. do not attempt implicit JSON Schema conversion
2. throw a registration error explaining that MCP registration surfaces require JSON-exportable schema input

## Why It Looks More Complex Than It Is

The logic exists to bridge three schema worlds with explicit boundaries:

- plain JSON Schema
- validation and type inference through `StandardSchemaV1`
- JSON export through `StandardJSONSchemaV1`

Most of the code is not doing heavy work. It is mostly:

- schema-shape detection
- one-time JSON Schema export at registration
- compatibility protection around the parent MCP SDK

The expensive step is JSON Schema export, and that only happens during registration.

## Performance Characteristics

### Cost paid once

Schema normalization happens when a tool or prompt is registered.

It does not happen on every tool call.

That means:

- `registerTool(...)`: normalization cost once per tool registration
- `registerPrompt(...)`: normalization cost once per prompt registration
- `callTool(...)`: no schema export
- `validateToolInput(...)` / `validateToolOutput(...)`: validate already-normalized JSON Schema

### Hot path behavior

The request-time hot path is still:

- JSON Schema validation for registered MCP-B tools
- normal tool execution

Newly registered MCP-B tools should not rely on validator-specific runtime branches.

### `listTools()` behavior

`listTools()` still calls `toTransportSchema(...)`, but by that point schemas are already plain JSON Schema. So this is a lightweight normalization pass, not validator conversion.

## Why This Is Better Than React-Side Conversion

- One runtime normalization point instead of duplicate conversion logic
- Direct `@mcp-b/global` consumers get the same behavior as `react-webmcp`
- `react-webmcp` no longer owns transport/runtime schema policy
- Native mirroring always receives JSON Schema, which is the only format it understands

## Practical Summary

The design is centralized, not hot-path-heavy:

- normalization happens at registration time
- validation and execution stay on the fast path
- `react-webmcp` no longer owns JSON export conversion
- direct `@mcp-b/global` registration follows the same schema contract as the SDK and hooks
