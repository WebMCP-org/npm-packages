# MCP-B Package Philosophy

This document explains package boundaries in this monorepo and how the WebMCP core relates to MCP-B extensions.

## Why This Exists

WebMCP is under active design. Breaking changes are expected as the API surface stabilizes.
To keep integration predictable, this repo separates:

1. strict WebMCP core contracts
2. strict core runtime behavior
3. MCP-B extension/runtime features on top of core

## Package Layers

### 1) Official `webmcp-types` and MCP-B adapter extensions

- The Community Group's official `webmcp-types` owns the WebMCP browser contracts and
  `document.modelContext` declaration.
- `@mcp-b/webmcp-ts-sdk` owns MCP-B adapter and extension contracts, along with schema
  conversion helpers.
- MCP-B extensions do not broaden the official core declaration. `@mcp-b/webmcp-types` is
  deprecated; it only forwards `webmcp-types` exports for existing package consumers.

Use when you want:

- standard browser contracts and input inference: `webmcp-types`
- MCP-B adapter extensions or schema conversion: `@mcp-b/webmcp-ts-sdk`

### 2) `@w3c/webmcp-polyfill` (Canonical Core Runtime) and `@mcp-b/webmcp-polyfill`

- The W3C Community Group's `@w3c/webmcp-polyfill` is the canonical core runtime. It installs
  the standard `document.modelContext` API, including frames. It does not ship declarative
  tools or lifecycle events yet.
- `@mcp-b/webmcp-polyfill` is deprecated. It passes through `@w3c/webmcp-polyfill` and adds
  temporary MCP-B declarative tools and `SubmitEvent` extensions until the official polyfill
  supports them.

Use when you want:

- the standard imperative API without MCP-B bridge features: `@w3c/webmcp-polyfill`
- declarative tools without native support, without MCP-B bridge features: `@mcp-b/webmcp-polyfill`

### 3) `@mcp-b/global` (MCP-B Runtime Entry Point)

- Orchestrates the polyfill, `BrowserMcpServer`, and browser transport.
- Adds MCP extensions, including `outputSchema`, around the polyfill runtime.
- Exports initialization and transport configuration types. The browser adapter and its extension types belong to `@mcp-b/webmcp-ts-sdk`.

Use when you want:

- full MCP-B behavior
- extension APIs beyond strict core WebMCP
- runtime features that integrate broader MCP protocol behavior in-page

### 4) `@mcp-b/react-webmcp` (React for MCP-B Integrations)

- React hooks for tools, prompts, resources, and MCP client providers.
- Pairs with `@mcp-b/global` at runtime and imports contracts from their owning packages.

Use when you want:

- React + full MCP-B capabilities

### 5) `usewebmcp` (React for Strict Core API)

- Standalone React hooks for strict core WebMCP usage.
- Designed for `document.modelContext` core-only workflows.
- Not an alias package and not a re-export of `@mcp-b/react-webmcp`.

Use when you want:

- React hooks limited to strict core WebMCP behavior

## Dependency and Ownership Model

Core layering:

1. `webmcp-types` -> core browser type contracts; `@mcp-b/webmcp-ts-sdk` -> MCP-B adapter
   and extension contracts
2. `@w3c/webmcp-polyfill` -> canonical core runtime behavior; `@mcp-b/webmcp-polyfill` ->
   temporary declarative tools on top of it
3. `@mcp-b/global` -> MCP-B extensions/runtime built on core
4. `@mcp-b/react-webmcp` -> React hooks for MCP-B runtime
5. `usewebmcp` -> React hooks for strict core API

## Contribution Rules for This Boundary

1. Keep MCP-B-only extensions out of the official `document.modelContext` declaration.
2. Put the browser adapter and its extension types in `@mcp-b/webmcp-ts-sdk`; keep runtime orchestration in `@mcp-b/global`.
3. Keep `@mcp-b/react-webmcp` aligned with the packages that own each contract. Do not use `@mcp-b/global` as a type barrel.
4. Keep `usewebmcp` aligned with `webmcp-types`: accept WebMCP JSON Schema metadata and pass inputs through without validation. Standard Schema conversion and validation, MCP formatting, and output metadata belong in `@mcp-b/react-webmcp`.
5. If a shared type crosses packages, move it to the correct canonical layer rather than duplicating.

## Quick Selection Guide

1. Need core browser contracts only: `webmcp-types`; use `@mcp-b/webmcp-ts-sdk`
   for MCP-B adapter extensions or schema conversion
2. Need the standard core runtime without MCP-B bridge features: `@w3c/webmcp-polyfill`; add
   `@mcp-b/webmcp-polyfill` only for declarative tools without native support
3. Need full MCP-B runtime and extension APIs: `@mcp-b/global`
4. Need React hooks for MCP-B: `@mcp-b/react-webmcp`
5. Need React hooks for strict core only: `usewebmcp`
