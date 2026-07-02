# @mcp-b/webmcp-local-relay

## 4.0.0

## 3.0.0

### Major Changes

- Align this package with the WebMCP v3 release train. This package has no direct API changes in this release.

## 2.3.1

## 2.3.0

### Patch Changes

- 3ce0b6a: Make the relay widget's per-request timeout configurable via a new `data-request-timeout` attribute on the embed script tag, and bump the default from 10s to 60s so long-running tools (e.g. those chaining several API calls) work out of the box. Closes #197.

  Usage:

  ```html
  <script
    src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@latest/dist/browser/embed.js"
    data-request-timeout="120000"
  ></script>
  ```

  Invalid values (non-positive integers) cause the widget to refuse to start and log an error, mirroring the existing `data-relay-port` validation behavior.

## 2.2.0

### Patch Changes

- Use workspace:\* for internal webmcp-types dependency.

## 2.1.0

### Minor Changes

- Add port range discovery, subprotocol handshake, and proactive heartbeat to the local relay.
  - **Port range**: Server tries ports 9333-9348 instead of failing on a single port. Persists chosen port to `~/.webmcp/relay-port.json` for stable restarts.
  - **Browser discovery**: Widget probes the port range sequentially with a state machine (connected, retry-same-endpoint, rediscover) and caches endpoints in sessionStorage.
  - **Subprotocol handshake**: WebSocket connections use `webmcp.v1` / `webmcp-discovery.v1` subprotocols. Server sends `server-hello` with relay identity (instanceId, label, workspace, relayId) on connect.
  - **Multi-relay selection**: New `data-relay-id` and `data-relay-workspace` embed attributes for filtering relays during discovery.
  - **Heartbeat**: Server pings connected sources every 15s and closes dead connections after 25s of no response, enabling fast rediscovery after ungraceful relay deaths.
  - **Lazy connect**: New `data-auto-connect="false"` option to defer discovery until explicit `webmcp.connect` message.
  - **Iframe permissions**: Embed iframe includes `allow="loopback-network; local-network; local-network-access"` for future browser LNA support.

## 2.0.13

### Patch Changes

- Default targetOrigin to '\*' in TabClientTransport and IframeParentTransport instead of throwing when not set. Fix relay schema backwards compatibility by making sources and toolSourceMap optional with empty defaults in RelayServerToolsSchema.

## 2.0.12

## 2.0.11

## 2.0.10

## 2.0.9

## 2.0.8

## 2.0.7
