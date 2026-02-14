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
- Focused on core `navigator.modelContext` semantics and type inference quality.
- Does not define MCP-B-only convenience/extensions as part of the core global surface.

Use when you want:

- strong schema inference for tool input/output
- strict compile-time compatibility with the core WebMCP shape

### 2) `@mcp-b/webmcp-polyfill` (Canonical Core Runtime)

- Strict runtime polyfill for core WebMCP behavior.
- Includes compatibility for current browser testing realities (`modelContextTesting`) where applicable.
- Built on top of `@mcp-b/webmcp-types`.

Use when you want:

- a strict core runtime implementation without MCP-B bridge features

### 3) `@mcp-b/global` (MCP-B Runtime + Extension Types)

- MCP-B runtime that layers extension behavior on top of core WebMCP.
- Provides bridge semantics so tools can be exposed via both native WebMCP patterns and MCP flows.
- Exports extension-aware types used by MCP-B integrations (resources/prompts/sampling/elicitation/testing helpers).

Use when you want:

- full MCP-B behavior
- extension APIs beyond strict core WebMCP
- runtime features that integrate broader MCP protocol behavior in-page

### 4) `@mcp-b/react-webmcp` (React for MCP-B Runtime)

- React hooks for the full MCP-B runtime surface.
- Should type against MCP-B extension exports from `@mcp-b/global`.
- Includes provider/client patterns and richer extension workflows.

Use when you want:

- React + full MCP-B capabilities

### 5) `usewebmcp` (React for Strict Core API)

- Standalone React hooks for strict core WebMCP usage.
- Designed for `navigator.modelContext` core-only workflows.
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

1. Do not broaden `@mcp-b/webmcp-types` global `navigator.modelContext` to MCP-B-only extensions.
2. Put MCP-B extension typings and extension runtime behavior in `@mcp-b/global`.
3. Keep `@mcp-b/react-webmcp` aligned with MCP-B extension types from `@mcp-b/global`.
4. Keep `usewebmcp` aligned with strict core types from `@mcp-b/webmcp-types`.
5. If a shared type crosses packages, move it to the correct canonical layer rather than duplicating.

## Quick Selection Guide

1. Need strict core contracts only: `@mcp-b/webmcp-types`
2. Need strict core runtime only: `@mcp-b/webmcp-polyfill`
3. Need full MCP-B runtime and extension APIs: `@mcp-b/global`
4. Need React hooks for MCP-B: `@mcp-b/react-webmcp`
5. Need React hooks for strict core only: `usewebmcp`
