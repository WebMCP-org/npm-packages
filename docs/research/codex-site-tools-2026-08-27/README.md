# Codex site tools compatibility probe

This directory preserves the fixtures and results behind the August 27, 2026
[Codex site tools compatibility snapshot](../../../apps/documentation-website/reference/webmcp/codex-site-tools.mdx).

## Environment

- macOS
- ChatGPT desktop app's built-in browser; build identifier unavailable
- Codex with GPT-5.6 Sol
- `http://127.0.0.1:41739`, where `window.isSecureContext === true`
- `document.modelContext` supplied by the built-in browser
- no MCP-B package or WebMCP polyfill
- WebMCP Community Group draft dated August 26, 2026, reviewed at
  [webmachinelearning/webmcp@41d12f0](https://github.com/webmachinelearning/webmcp/tree/41d12f057167ccf5954dbcf49d99502cb6c84491)

## Run the fixtures

```bash
node docs/research/codex-site-tools-2026-08-27/server.mjs
```

Open `http://127.0.0.1:41739` in ChatGPT's built-in browser. The server maps
each HTML filename to a page at the same origin. It adds
`Permissions-Policy: tools=()` only for `policy-disabled.html`.

| Fixture                | Probe                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `imperative.html`      | Page API, registration errors, origin options, and cleanup |
| `lifecycle.html`       | Dynamic registration, invocation, and abort-based removal  |
| `results.html`         | Agent-bridge result values and errors                      |
| `declarative.html`     | Declarative form discovery                                 |
| `iframe-parent.html`   | Same-origin iframe discovery and child-frame page API      |
| `policy-disabled.html` | Registration and discovery with the tools policy disabled  |

The captured page output is in [imperative-results.json](./imperative-results.json).
Manually recorded agent-bridge calls are in [agent-results.json](./agent-results.json).

## Manual agent procedure

1. Open the root page and refresh the agent's site-tool list. Record the
   `codex_probe_echo` listing, then call it with each
   `toolInputCalls.*.value.input` object.
2. Open `results.html`, refresh the list, and call
   `codex_probe_result_shape` once for each `mode` under `toolResultCalls`.
3. Open `lifecycle.html`, select **Register dynamic tool**, refresh the list,
   call `codex_probe_dynamic` with `{}`, select **Abort registration**, and
   refresh again. Register it once more, navigate away, and confirm the previous
   page's tools disappear.
4. Open `declarative.html` and `iframe-parent.html`, refreshing the list on
   each page. Record whether either fixture contributes a tool and inspect the
   child frame's displayed `document.modelContext` type.
5. Open `policy-disabled.html`, confirm that page registration resolves,
   refresh the list, and record whether `codex_probe_policy_disabled` appears.

## Limits

This is a dated manual compatibility probe, not a Web Platform Test run or an
OpenAI conformance claim. It covers one app build and account configuration.
It does not cover every origin, cross-document execution, or cancellation of an
active call.
