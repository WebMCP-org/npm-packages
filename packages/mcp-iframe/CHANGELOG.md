# @mcp-b/mcp-iframe

## 5.0.0

### Major Changes

- de0b41c: Make the package root the only auto-registering entry point and move custom
  element registration to the side-effect-free `/element` export. Remove raw
  client and refresh aliases, refresh advertised child items automatically, and
  apply the call timeout to tools, resources, and prompts.
- de0b41c: Rename the `mcp-iframe-tools-changed` event to `mcp-iframe-items-changed`, since
  it fires for every kind of item the frame exposes, not only tools. Listeners
  registered under the old name stop firing silently — there is no deprecation
  shim. Update `addEventListener('mcp-iframe-tools-changed', …)` to
  `addEventListener('mcp-iframe-items-changed', …)`.

### Patch Changes

- de0b41c: Honor `exposedTo` over the iframe bridge instead of rejecting it.

  `registerTool(tool, { exposedTo })` previously threw `NotSupportedError` unless native
  WebMCP was present, so spec-conformant child code crashed under the polyfill inside an
  `<mcp-iframe>` — the one place a userland cross-document channel actually exists. The
  composed server now stores the allowlist and only advertises a restricted tool once the
  connected embedder's origin matches it.

  `IframeChildTransport` gained `clientOrigin` and an `onclientorigin` callback that report
  the connected parent. `BrowserMcpServer` reads them duck-typed, so transports that cannot
  name a peer keep every restricted tool off the wire.

  Restricted tools fail closed. The MCP handle is disabled in the same synchronous step that
  creates it, so a tool is never listable between registration and its first audience check,
  and it stays hidden when no peer origin is ever established. Tools registered without
  `exposedTo` are untouched.

  Two limits, stated because the spec's guarantee is stronger:
  - `exposedTo` only narrows. `allowedOrigins` on the child transport still decides who may
    connect, and no allowlist widens past it.
  - Enforcement is the child's own JavaScript, not the user agent. Native WebMCP enforces
    `exposedTo` in the browser; this does not, so treat it as scoping rather than a boundary
    against a compromised child.

  `getTools({ fromOrigins })` still throws `NotSupportedError`. Parent-side discovery stays
  `@mcp-b/mcp-iframe`'s job rather than something the SDK reaches across documents to do.

- de0b41c: Require Node 20 or newer. `@mcp-b/global`, `@mcp-b/mcp-iframe`,
  `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-ts-sdk` previously allowed Node 18;
  the rest declared no `engines` range at all and now state the same floor. Node 18
  reached end of life in April 2025. Browser builds are unaffected — this governs
  build tooling and the relay CLI.
- de0b41c: Ignore duplicate iframe items instead of dropping a live registration. A child
  that advertises two items mapping to the same parent name or wrapper URI no
  longer displaces the first registration from the connection's bookkeeping, so
  disconnecting always unregisters everything the element registered.
- de0b41c: Stop emitting declaration source maps, and ship the MIT `LICENSE` text these
  packages already declared. Each package shipped `dist` without `src`, so every
  published `.d.ts.map` pointed at a file that was not in the tarball; editors
  already fall back to the `.d.ts` itself. `@mcp-b/webmcp-types` keeps its maps —
  it is the one package that ships `src`, so its maps resolve.
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
- Updated dependencies [de0b41c]
  - @mcp-b/transports@5.0.0

## 4.0.0

### Patch Changes

- Updated dependencies [abaf5d0]
- Updated dependencies [d05ea62]
  - @mcp-b/webmcp-types@4.0.0
  - @mcp-b/webmcp-ts-sdk@4.0.0
  - @mcp-b/transports@4.0.0

## 3.0.0

### Major Changes

- Align with the WebMCP v3 release train and consume the document-first WebMCP type, SDK, and transport packages. This package has no direct API changes in this release.

### Patch Changes

- Updated dependencies [4f3cc5e]
  - @mcp-b/webmcp-types@3.0.0
  - @mcp-b/webmcp-ts-sdk@3.0.0
  - @mcp-b/transports@3.0.0

## 2.3.1

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.3.1
  - @mcp-b/webmcp-ts-sdk@2.3.1
  - @mcp-b/transports@2.3.1

## 2.3.0

### Patch Changes

- Updated dependencies
- Updated dependencies [9289d98]
  - @mcp-b/webmcp-types@2.3.0
  - @mcp-b/webmcp-ts-sdk@2.3.0
  - @mcp-b/transports@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies
- Updated dependencies [2540527]
  - @mcp-b/transports@2.2.0
  - @mcp-b/webmcp-types@2.2.0
  - @mcp-b/webmcp-ts-sdk@2.2.0

## 2.1.0

### Patch Changes

- @mcp-b/webmcp-types@2.1.0
- @mcp-b/webmcp-ts-sdk@2.1.0
- @mcp-b/transports@2.1.0

## 2.0.13

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@2.0.13
  - @mcp-b/webmcp-types@2.0.13
  - @mcp-b/webmcp-ts-sdk@2.0.13

## 2.0.12

### Patch Changes

- @mcp-b/webmcp-types@2.0.12
- @mcp-b/webmcp-ts-sdk@2.0.12
- @mcp-b/transports@2.0.12

## 2.0.11

### Patch Changes

- @mcp-b/webmcp-types@2.0.11
- @mcp-b/webmcp-ts-sdk@2.0.11
- @mcp-b/transports@2.0.11

## 2.0.10

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-ts-sdk@2.0.10
  - @mcp-b/transports@2.0.10
  - @mcp-b/webmcp-types@2.0.10

## 2.0.9

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-ts-sdk@2.0.9
  - @mcp-b/transports@2.0.9
  - @mcp-b/webmcp-types@2.0.9

## 2.0.8

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.8
  - @mcp-b/webmcp-ts-sdk@2.0.8
  - @mcp-b/transports@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies
  - @mcp-b/webmcp-types@2.0.7
  - @mcp-b/webmcp-ts-sdk@2.0.7
  - @mcp-b/transports@2.0.7

## 0.0.0

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@0.0.0

## 0.0.0-beta-20260109203913

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@0.0.0-beta-20260109203913

## 0.2.0

### Minor Changes

- a262b42: Enforce MCP name validation for tool and prompt prefixes

  **BREAKING CHANGE**: Default prefix separator changed from `:` to `_` to comply with MCP schema requirements.

  Tool and prompt names must match the pattern `^[a-zA-Z0-9_-]{1,128}# @mcp-b/mcp-iframe. The previous default separator `:` was invalid according to this schema.

  Changes:
  - Changed default `prefix-separator` from `:` to `_`
  - Added runtime validation for prefix separator (warns and sanitizes invalid characters)
  - Added validation for element ID/name (warns and sanitizes invalid characters)
  - Added validation before tool/prompt registration (skips registration with error if final name is invalid)
  - Names exceeding 128 characters will not be registered

  If you were relying on the `:` separator, you can either:
  1. Accept the new `_` separator (recommended for MCP compatibility)
  2. Explicitly set `prefix-separator=":"` attribute (not recommended as it may cause MCP validation errors)

## 0.2.0-beta.0

### Minor Changes

- a262b42: Enforce MCP name validation for tool and prompt prefixes

  **BREAKING CHANGE**: Default prefix separator changed from `:` to `_` to comply with MCP schema requirements.

  Tool and prompt names must match the pattern `^[a-zA-Z0-9_-]{1,128}# @mcp-b/mcp-iframe. The previous default separator `:` was invalid according to this schema.

  Changes:
  - Changed default `prefix-separator` from `:` to `_`
  - Added runtime validation for prefix separator (warns and sanitizes invalid characters)
  - Added validation for element ID/name (warns and sanitizes invalid characters)
  - Added validation before tool/prompt registration (skips registration with error if final name is invalid)
  - Names exceeding 128 characters will not be registered

  If you were relying on the `:` separator, you can either:
  1. Accept the new `_` separator (recommended for MCP compatibility)
  2. Explicitly set `prefix-separator=":"` attribute (not recommended as it may cause MCP validation errors)

## 0.1.0

### Minor Changes

- 1f26978: Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element
- Stable release of all packages with backwards-compatible improvements.

### Patch Changes

- 02833d3: Bump all packages to new beta release
- 1f26978: Beta release for testing
- 7239bb5: Bump all packages to new beta release
- b8c2ea5: Beta release bump
- Updated dependencies [02833d3]
- Updated dependencies [1f26978]
- Updated dependencies [7239bb5]
- Updated dependencies [1f26978]
- Updated dependencies [b8c2ea5]
- Updated dependencies
  - @mcp-b/transports@1.2.0

## 0.1.0-beta.3

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.4

## 0.1.0-beta.2

### Patch Changes

- Bump all packages to new beta release
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.3

## 0.1.0-beta.1

### Patch Changes

- Beta release bump
- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.2

## 0.1.0-beta.0

### Minor Changes

- Add dedicated @mcp-b/mcp-iframe package for MCPIframeElement custom element

### Patch Changes

- Updated dependencies
  - @mcp-b/transports@1.1.2-beta.1
