# MCP-B Package Philosophy

This document explains package boundaries in this monorepo and how the WebMCP core relates to MCP-B extensions.

## Why This Exists

WebMCP is under active design. Breaking changes are expected as the API surface stabilizes.
To keep integration predictable, this repo separates:

1. strict WebMCP core contracts
2. strict core runtime behavior
3. MCP-B extension/runtime features on top of core

## Package Layers

### 1) `@mcp-b/webmcp-types` (Canonical Core Types)

- Canonical source for strict WebMCP TypeScript contracts.
- Focused on core `document.modelContext` semantics and type inference quality.
- Does not define MCP-B-only convenience/extensions as part of the core global surface.

Use when you want:

- strong schema inference for tool input/output
- strict compile-time compatibility with the core WebMCP shape

### 2) `@mcp-b/webmcp-polyfill` (Canonical Core Runtime)

- Strict runtime polyfill for core WebMCP behavior.
- Includes the optional MCP-B `modelContextTesting` compatibility shim where applicable.
- Built on top of `@mcp-b/webmcp-types`.

Use when you want:

- a strict core runtime implementation without MCP-B bridge features

### 3) `@mcp-b/global` (MCP-B Runtime Entry Point)

- Orchestrates the polyfill, `BrowserMcpServer`, and browser transport.
- Installs the runtime behind the canonical `document.modelContext` surface.
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

1. `@mcp-b/webmcp-types` -> canonical core type contracts
2. `@mcp-b/webmcp-polyfill` -> canonical core runtime behavior
3. `@mcp-b/global` -> MCP-B extensions/runtime built on core
4. `@mcp-b/react-webmcp` -> React hooks for MCP-B runtime
5. `usewebmcp` -> React hooks for strict core API

## Contribution Rules for This Boundary

1. Do not broaden `@mcp-b/webmcp-types` global `document.modelContext` to MCP-B-only extensions.
2. Put the browser adapter and its extension types in `@mcp-b/webmcp-ts-sdk`; keep runtime orchestration in `@mcp-b/global`.
3. Keep `@mcp-b/react-webmcp` aligned with the packages that own each contract. Do not use `@mcp-b/global` as a type barrel.
4. Keep `usewebmcp` aligned with strict core types from `@mcp-b/webmcp-types`.
5. If a shared type crosses packages, move it to the correct canonical layer rather than duplicating.

## Quick Selection Guide

1. Need strict core contracts only: `@mcp-b/webmcp-types`
2. Need strict core runtime only: `@mcp-b/webmcp-polyfill`
3. Need full MCP-B runtime and extension APIs: `@mcp-b/global`
4. Need React hooks for MCP-B: `@mcp-b/react-webmcp`
5. Need React hooks for strict core only: `usewebmcp`
