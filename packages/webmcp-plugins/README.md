# @mcp-b/webmcp-plugins

Plugins run around every execution of a WebMCP tool, whether an agent or your own code calls
it. A plugin can observe the call, delay it, or refuse it. This package ships two plugins:
consent and tracing.

```sh
npm install @mcp-b/webmcp-plugins
```

## Use plugins

With `document.modelContext`, wrap the tool before registering it:

```ts
import { withPlugins } from '@mcp-b/webmcp-plugins';
import { otel } from '@mcp-b/webmcp-plugins/otel';

document.modelContext.registerTool(
  withPlugins(
    {
      name: 'search_notes',
      description: 'Search notes by text',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      } as const,
      execute: ({ query }: { query: string }) => searchNotes(query),
    },
    [otel()]
  )
);
```

With `@mcp-b/react-webmcp`, pass `plugins` to `useWebMCP`. Plugins there receive the input after
Standard Schema validation, and refusals reach agents as MCP errors:

```tsx
useWebMCP({ name: 'search_notes', description, inputSchema, plugins: [otel()], execute });
```

With the core `usewebmcp` hook, wrap the config: `useWebMCP(withPlugins(config, plugins))`.

Plugins run in array order, outermost first.

## Consent

`ConsentGuard` queues calls that need the user's approval. Your UI lists `guard.getPending()`
and calls `guard.decide(id, approved)`. The `consent` plugin rejects refused calls with a
`NotAllowedError` `DOMException`, without running the tool.

```ts
import { ConsentGuard, consent, toMcpAnnotations } from '@mcp-b/webmcp-plugins/consent';

const guard = new ConsentGuard();
const policy = {
  scope: ['write:notes'],
  reversible: false,
  riskLevel: 'high',
  requiresApproval: true,
  requireUserPresence: true,
} as const;

document.modelContext.registerTool(
  withPlugins({ ...deleteNote, annotations: toMcpAnnotations(policy) }, [consent(guard, policy)])
);

guard.subscribe(() => render(guard.getPending()));
approveButton.onclick = () => guard.decide(request.id, true);
```

React apps use `ConsentProvider`, `useGuardedWebMCP`, and `usePendingConsentRequests` from
`@mcp-b/react-webmcp`.

- `requiresApproval` can be a function of the call's input, to prompt only for risky calls.
- `decide(id, true, true)` approves the tool for the rest of the session. This applies only to
  reversible tools without `requireUserPresence`, and it covers every later input, even when
  `requiresApproval` is a function.
- `requireUserPresence` runs a WebAuthn user-verification ceremony (Touch ID, Windows Hello,
  or a security key) on every approval. Call `decide()` directly from the click handler so the
  ceremony keeps the click's user activation. After three failed ceremonies, the tool is
  refused as `rate-limited` for 10 seconds, then 30 seconds, then 90 seconds, up to 5 minutes.
  Requests already waiting for that tool are refused too.
- The default ceremony is local. It proves that a person was present, not who they are. To
  verify on your server, pass `new ConsentGuard({ verifyPresence })`. It receives the request
  and an `AbortSignal` that aborts when the request is cancelled or denied. The request's timeout
  pauses during the check.
- Automation can attach a virtual authenticator. Presence raises the cost of a synthetic
  approval but does not rule it out.

## Tracing

`otel()` records one span per call that reaches it, with the application's OpenTelemetry
tracer. Calls refused by an earlier plugin, such as `consent`, get no span. It installs no
SDK or exporter and records no inputs, results, or error messages. Install
`@opentelemetry/api` to use it. Pass `otel({ tracer })` to choose a tracer.

## Write a plugin

A plugin is an object with a `name` and an `aroundExecute` function:

```ts
import type { WebMCPPlugin } from '@mcp-b/webmcp-plugins';

const audit: WebMCPPlugin = {
  name: 'audit',
  async aroundExecute(call, next) {
    log(`${call.name} started`);
    try {
      return await next();
    } finally {
      log(`${call.name} finished`);
    }
  },
};
```

`call` has the tool `name`, the `input` its `execute` receives, and the caller's abort
`signal`. Call `next()` at most once and return its result, or throw to refuse the call. The
types enforce returning `next()`'s result.

## Adding a plugin to this package

Plugins belong in your application by default. One is added here only when it meets all of
these:

- **Needed by many apps.** Several independent applications need it, and getting it right is
  harder than the few lines a reader could write.
- **Security or protocol behavior.** It enforces a user-facing guarantee, such as consent, or
  follows a published convention, such as OpenTelemetry semantic conventions.
- **Fits the contract.** It works through `aroundExecute` alone, with no changes to the core,
  the hooks, or `BrowserMcpServer`.
- **Costs nothing when unused.** It is a separate subpath export. Any third-party dependency is
  an optional peer dependency.
- **Tested through `withPlugins`.** Tests cover refusal, cancellation, and errors, not only
  success.

Open an issue that makes this case before opening a pull request.
