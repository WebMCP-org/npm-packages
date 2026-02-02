# Fetch Proxy Implementation Plan

## Goal

Deliver a fetch wrapper that proxies requests through an MCP tool (`http_request`) so sandboxed iframe apps can call backend logic via the host without direct network access.

## Constraints

- **Single path:** iframe → postMessage → host → MCP tool → server logic.
- **Fetch-aligned schema:** request/response payloads map to standard Fetch semantics.
- **No WebMCP changes in this phase.**
- **Host observability:** requests are visible and enforceable at the MCP boundary.

## Milestones

### 1) Transport Contract (Done)
- Define `http_request` payload/response types aligned with Fetch.
- Support `method`, `url`, `headers`, `redirect`, `cache`, `credentials`, `timeoutMs`.
- Support body encodings: `json`, `text`, `urlEncoded`, `formData`, `base64`, `none`.

### 2) Client Wrapper (Done)
- Implement `createMcpFetch(client, options)` to serialize Fetch calls into `http_request`.
- Implement `initMcpFetch(client, options)` to patch/restore `globalThis.fetch`.
- Handle AbortSignal by wiring to MCP `callTool`.

### 3) Server Tool Helper (Done)
- Provide a utility to build `http_request` tool handlers:
  - Response builder helper
  - Handler wrapper that emits structured responses

### 4) Demo Integration (Next)
- Add a minimal iframe demo that uses the wrapper to fetch `/api/time`.
- Route the request to shared application logic in the MCP server.
- Verify host-visible logging.

### 5) Tests (Done + Expand)
- Unit tests for request serialization and response reconstruction.
- Add integration test to ensure fetch → `http_request` → response round-trips.

## Risks & Mitigations

- **Binary streaming:** Deferred in MVP. Use `base64` encoding for binary payloads.
- **FormData file handling:** Supported via base64 encoding for file entries.
- **Error propagation:** MCP errors should be surfaced as `Response` with error JSON.

## Success Criteria

- Apps can call `fetch('/api/...')` in a sandboxed iframe and receive responses.
- Host observes every request at the MCP boundary.
- No dependency on direct network access from the iframe.
- Wrapper can be adopted without modifying WebMCP tool registration.
