# RFC: Invocation middleware and optional React state

Status: proposal for an experimental implementation. The APIs below are not published.

Introduce one framework-independent `aroundInvoke(call, next)` contract for consent,
OpenTelemetry, and optional execution-state observation. React registers tools and subscribes
only where the UI displays state. Keep the existing `useWebMCP` as the stateful convenience hook.

This builds on [#329's shared hook](https://github.com/WebMCP-org/npm-packages/pull/329) and
[#328's consent broker](https://github.com/WebMCP-org/npm-packages/pull/328). A plugin registry,
automatic retries, caching, middleware result replacement, and reusable approval grants are
outside this first contract. Middleware observes success or rejects to prevent execution.

## Invocation contract

One runner owns validation, the captured handler, cancellation, middleware dispatch, and
response formatting. Adapters supply browser/MCP context and deliver its terminal result.
Registration is a separate lifecycle.

```ts
interface ToolIdentity {
  readonly instanceId: string;
  readonly name: string;
  readonly registeringOrigin?: string;
}

interface PreparedOperation {
  readonly tool: ToolIdentity;
  /** Immutable description of the final validated arguments. */
  readonly arguments: unknown;
  /** Immutable application data binding approval to the intended effect. */
  readonly binding: unknown;
}

type Caller =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'reported'; readonly name: string }
  | { readonly kind: 'verified'; readonly subject: string; readonly authority: string };

interface InvocationContext {
  readonly id: string;
  readonly tool: ToolIdentity;
  readonly signal: AbortSignal;
  readonly caller: Caller;
  readonly traceContext: Readonly<{
    traceparent?: string;
    tracestate?: string;
    baggage?: string;
  }>;
  prepare(): Promise<PreparedOperation>;
}

interface InvocationResult<T> {
  readonly value: T;
  readonly response: unknown;
}

interface InvocationFailure extends Error {
  readonly kind:
    | 'denied'
    | 'cancelled'
    | 'invalid_input'
    | 'tool_error'
    | 'format_error'
    | 'middleware_error';
  readonly cause: unknown;
  readonly response?: unknown;
}

type AroundInvoke<T> = (
  call: InvocationContext,
  next: () => Promise<InvocationResult<T>>
) => Promise<InvocationResult<T>>;
```

`value` is the original successful handler result; `response` is its prepared agent-facing
representation. Local `execute()` skips agent `formatOutput`/`formatError` entirely and returns
`value`; its unused `response` is also `value`. Only protocol delivery performs formatting, inside
the runner. A failing agent formatter cannot break a local call. Middleware preserves the result
in this version. Tool middleware and execution observers share that tool's result type `T`.

The runner creates a fresh invocation ID and captures the tool instance, handler, schema,
formatters, middleware list, and trusted adapter context at call start. A tool name or a
caller-supplied invocation ID is insufficient to identify an existing invocation.

### Preparation and ordering

The first middleware in the array is outermost. For `[otel, state, consent]`, entry order is
OTel, state, consent; completion unwinds in reverse. The terminal continuation executes the
captured handler, after awaiting preparation. Consent obtains the operation with `prepare()`:

```ts
async function consent<T>(
  call: InvocationContext,
  next: () => Promise<InvocationResult<T>>
): Promise<InvocationResult<T>> {
  const operation = await call.prepare();
  await broker.authorize({ invocationId: call.id, operation, signal: call.signal });
  call.signal.throwIfAborted();
  return next();
}
```

Here `broker.authorize` resolves only after the required policy succeeds and rejects on denial,
verification failure, or cancellation. It is a proposed broker method, not #328's current API.

```mermaid
sequenceDiagram
    participant A as Adapter
    participant O as OTel / state
    participant C as Consent
    participant R as Runner
    A->>O: Invoke with captured context
    O->>C: next()
    C->>R: prepare()
    R-->>C: Validated, bound operation
    C->>C: Await required approval
    C->>R: next()
    R->>R: Check cancellation and binding; execute; format
    R-->>O: Result or typed failure
    O-->>A: Same outcome
```

The runner must:

- Memoize preparation before calling application validation; concurrent calls share one promise,
  including its rejection. Preparation validates/transforms once and never invokes the handler.
- Expose final approval data only through that preparation result. Keep raw input and the actual
  executable binding private. `next()` takes no replacement arguments or handler.
- Include validation and async success/error formatting inside the invocation observed by outer
  middleware. OTel and state therefore precede consent. They must also work without consent.
- Claim each continuation synchronously. Repeated calls, concurrent calls, and calls after that
  layer settles, cancellation, or terminal settlement reject without dispatching downstream work.
- Require middleware to await or return its continuation. Returning early while downstream work
  remains pending is a contract error. Observe every started promise to avoid orphaned rejections.

This limits dispatch within one invocation. It does not guarantee exactly-once remote effects
across network retries; the authoritative application needs idempotency for that guarantee.

### Arguments and approval binding

The runner owns a snapshot of caller input before asynchronous work begins. Approval data is
an immutable snapshot of validated arguments and the captured operation binding, including the
connection/tool identity and registration generation where the host knows them. A later lookup
by tool name must not select a replacement handler. A replaced or disconnected binding requires
a new invocation and approval.

For JSON data, copy and freeze the complete tree, including nested objects and arrays. Freezing
only the context or declaring TypeScript `readonly` does not provide this guarantee. Middleware
never receives the private mutable objects passed to the implementation. Do not revalidate or
rerun vendor transforms after approval.

Schemas producing non-JSON values still need an explicit application binding for consent: produce
an immutable, serializable approval description and execute the same captured operation it
describes. If the host cannot establish that binding, a consent-required invocation must fail.
Do not silently serialize values with lossy coercions. This binding is part of tool preparation,
not a general schema converter added to the strict polyfill.

In a rollback, the binding includes the service/environment and exact target deployment revision.
The authoritative executor verifies that binding and current authorization immediately before
the effect. Same-page middleware coordinates trusted application code; it cannot secure an API
against code that bypasses the wrapper. Passkey verification and protected effects belong at the
application's trusted boundary.

### Cancellation and outcomes

Cancellation before dispatch prevents the handler from starting. Cancelling pending consent
removes the request, dismisses UI/ceremonies where possible, and prevents late approval from
resuming it. Recheck the signal immediately before handler dispatch. Cancellation during work
ends the observed invocation once and ignores late completion; it does not roll back a write.

The chain resolves successes and rejects failures with the typed envelope above. The runner
normalizes preparation, policy, handler, and middleware failures. It recognizes its own envelopes
without trusting caller-supplied `kind` or `response` fields. On protocol delivery, optional async
`formatError` runs once for a failure, within the continuation's lifetime. If it fails, reject a
`format_error`; do not recursively format it. Cancellation bypasses formatting and retains its
original reason.

The outer adapter performs no further async formatting: it delivers an already-prepared error
response when one exists, otherwise rejects with the underlying cause. Test presence of the
`response` field, not truthiness; an explicitly formatted `undefined` is still a response.

A formatted failure remains a failure for state and tracing. The MCP adapter supplies a classifier
that runs inside the runner, before middleware unwinds: a validated `CallToolResult` with
`isError: true` becomes `tool_error`. Outer delivery only unwraps this classified outcome. A raw
application object with an `isError` property is ordinary data in the core, including local calls.
No middleware may recover denial or cancellation into success, retry the operation, or replace
results in this first version.

OTel and state observers must preserve the downstream outcome. Catch their own instrumentation
or subscriber failures separately and send them to a diagnostic sink. Never swallow downstream
policy/tool failures or let a diagnostic sink exception change settlement. Report one terminal
outcome even when abort and handler completion race.

## Initial implementations

### Consent and passkeys

Extract the React-free broker from #328. React supplies its provider, subscriber, and UI.
The broker accepts cancellation and settles each request once; it cannot delegate required
verification to a button component.

For verified passkey approval, the application server creates a fresh, expiring challenge bound
to the pending operation and user. Verify the assertion using the registered credential public
key, expected challenge, origin, RP ID, and required user-verification policy. Consume the
challenge once. The protected executor consumes a single-use operation grant and checks its
scope before executing. Enrollment, account authorization, credential storage, and remote
idempotency remain application responsibilities. See [SimpleWebAuthn verification][passkeys].

Required verification fails closed when unsupported, cancelled, invalid, or expired. An explicit
click-only policy is a different policy; hardware detection cannot downgrade required passkey
verification. This first version has no session-wide preapproval or approval reuse.

Use explicit read-only, destructive, and idempotent annotations. Reversibility and risk may inform
consent policy but do not determine those behavior annotations. Keep the registering page's
origin, transport-verified provenance, and authenticated principal distinct; default the caller
to `unknown`. Neither client names nor trace baggage establish identity. [MCP metadata][mcp-meta]
identifies client information as self-reported.

### OpenTelemetry

Accept an application-provided tracer and configured propagator; do not install a global
provider, exporter, or automatic flush. Span lifetime includes preparation, consent wait,
execution, and formatting. Record denial, cancellation, invalid input, and tool failure separately.
Exporter/instrumentation failures leave completed effects and their caller-visible outcomes intact.

For actual MCP traffic, follow the [MCP semantic conventions][otel-mcp], currently Development,
and extract propagation from the protocol metadata bag. Preserve `traceparent`, `tracestate`,
and `baggage` separately from tool arguments and subject to the application's propagation policy.
Use local/internal invocation spans for vanilla WebMCP; do not invent an MCP transport or protocol
version. Avoid duplicate spans when the enclosing MCP instrumentation already owns the operation.

Arguments, results, approval descriptions, credential IDs, and assertions are excluded by default.
Any argument/result capture is explicit, with application redaction. No raw passkey material is
recorded by these plugins.

### Execution state and React

`createExecutionState<T>()` supplies `aroundInvoke`, `subscribe`, `getSnapshot`, and `reset`.
Create one instance per mounted tool-owner lifetime, preserving it and pending calls across
metadata re-registration. An attached observer records calls even with zero subscribers.
Omitting it performs no execution-state allocation or notification work.

Retain #329's snapshot fields: `isExecuting`, `lastResult`, `error`, and `executionCount`.
Count overlapping calls, retain the last successful raw value, and count only successes after
any protocol formatting finishes. A validation error or formatted thrown failure does not increase
the count. Starting another call clears the previous execution error. `reset` clears observations without
cancelling pending work. The public state exposes the normalized underlying error, not the envelope.

One deliberate change needs migration notes: #329 counts a returned MCP `isError: true` envelope
as a fulfilled success. MCP delivery under this contract records it as a tool failure. Local calls
continue treating raw result objects as data.

Functions and unchanged snapshots have stable identity. Notify only on snapshot changes; one
listener throwing must not prevent others from being notified. Unsubscribing does not cancel work
or erase state. Never key stores by reusable tool names. Old invocations cannot update a replacement
instance's store after unmount/remount. Binding checks may invalidate a pending consent operation
when its registration changes; that does not reset the owner's execution history.

The React API is an explicit composition:

```tsx
// Proposed API; middleware instances are stable for this tool's lifetime.
const [execution] = useState(() => createExecutionState<RollbackResult>());

useWebMCPTool({
  ...config,
  middleware: [otel, execution.aroundInvoke, consent],
});

// In the small component displaying execution state:
const state = useToolExecutionState(execution);
```

`useWebMCPTool` owns registration and stable local execution controls, with `isSupported` and
`registrationError`, and never subscribes to execution state. `useToolExecutionState` uses
[React's `useSyncExternalStore`][react-store], stable subscribe/snapshot functions, and the same
idle snapshot for SSR and initial hydration. Subscribing never installs middleware; doing that
lazily would miss calls made before the UI mounts.

Keep `useWebMCP` as registration + one execution observer + subscription, preserving its existing
return fields and `reset`. The MCP-B hook retains its formatting/metadata adaptation. Keep React
18/19, `'use client'`, committed callback publication, and StrictMode cleanup. Begin without a
global store, selector API, or additional plugin-specific lifecycle hooks.

## Package and integration ownership

Use one experimental framework-free package for the runner and consent broker, with separate
`/state` and `/otel` entry points. Keep React integration in `usewebmcp` and UI in
`@mcp-b/react-webmcp`. Upstream `webmcp-types` continues to own browser declarations. The strict
polyfill gains no implicit policy, state tracking, OTel dependency, or nonstandard global methods.
Confirm the package name when implementing; the architectural requirement is independent imports.

| Entry path                                  | Initial coverage and required integration                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| React local `execute`                       | The same runner as that tool's registered callback                                                |
| React native/polyfilled registration        | The callback enters the runner once                                                               |
| Vanilla WebMCP                              | Explicitly register a callback returned by the runner                                             |
| SDK-owned tool, MCP/native mirror           | Both enter the SDK's shared execution callback; carry signal, provenance, and metadata through it |
| Arbitrary existing native/declarative tools | No interception guarantee; require an explicit adapter                                            |
| Direct application/server calls             | Must opt into the runner or enforce policy at their own trusted executor                          |

Choose one runner owner per invocation. React-to-SDK composition must preserve a trusted internal
invocation context so consent, transforms, state, and spans do not run twice. Never skip policy
because untrusted arguments or wire metadata claim an invocation was already checked. If the SDK
validates before calling a registered handler, adapt ownership so transforms still run once and
the observed protocol outcome includes earlier validation failures.

The current SDK callback forwards only arguments to the tool implementation; the native mirror
also drops execution options. Thread cancellation and available MCP request metadata through
these boundaries before claiming equivalent middleware coverage. See the [shared callback][sdk-run]
and [native/MCP adapters][sdk-adapters]. A transport-only hook cannot cover every row above.

[MCP interceptors (SEP-2624)][interceptors] remain a separate, open protocol proposal covering
broader discoverable validators/mutators. This RFC defines local JavaScript invocation behavior;
add a protocol adapter only when its semantics are sufficiently settled.

## TDD acceptance criteria

Start with one failing public-boundary test per behavior and the smallest implementation that
passes. Reuse the real browser/native/package fixtures from #329; mock verification/exporter
boundaries, not the runner or consent broker. Required checks:

| Behavior             | Observable acceptance criterion                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordering/preparation | Nested order is deterministic; concurrent `prepare()` calls validate once, including rejection; OTel/state see invalid input without executing                |
| Continuations        | Concurrent/double `next`, saved `next` after settlement, and early-return middleware never dispatch a second handler or leave unhandled rejections            |
| Approval binding     | Nested input mutation, changed tool/connection, expired/replayed grant, or wrong operation cannot authorize execution                                         |
| Verification         | Missing/invalid assertion, wrong challenge/origin/RP ID/credential, unmet user-verification policy, and unsupported required verification deny before effects |
| Cancellation         | Pre-abort, abort during validation/approval/formatting, late approval, and late handler completion settle once; pending consent and subscriptions clean up    |
| Failures             | Denial, cancellation, invalid input, thrown/returned errors, MCP error envelopes, and formatter failures remain distinct; raw `isError` data stays data       |
| Observation          | A throwing exporter/listener/diagnostic sink does not change the outcome or block other subscribers; every span ends once                                     |
| React                | Unsubscribed observers record calls with zero hook-caused call commits; a status child renders running/completion without rerendering its registration owner  |
| Lifetime             | Name reuse, overlapping calls, reset, unmount, SSR/hydration, StrictMode, and suspended renders preserve state and committed-handler guarantees               |
| Adapters/artifacts   | Local, vanilla, native, and SDK/MCP calls invoke the same policy once; declaration and bundle tests prove the base imports no React/OTel SDK/exporter         |

The [recorded baseline][baseline] uses source `e4bc3510295d19fdd8653b47a9694b0bfe8c8819`:
one render per description change, two renders per sequential call with state, zero registrations on
unrelated updates, and one registration per description change. Core/adapter bundles measure
1,654/2,068 gzip bytes with React excluded. Those are existing measurements, not results for this RFC.

Measure registration-only, state-enabled, attached-but-unsubscribed state, pass-through middleware,
and OTel-enabled configurations separately using the existing 1/10/100-tool scenarios. The proposed
registration-only target is zero hook-caused call renders; application state changes can still render
UI. Keep the state-enabled MCP Cat comparison intact. Report incremental gzip bytes, callback latency,
invocation completion latency, and listener cleanup. Timing ranges remain descriptive, with no
machine-sensitive CI thresholds and no claim that removing displayed state provides equivalent work.

## Implementation sequence and stabilization

1. Implement the experimental runner with preparation, continuation, cancellation, and outcome tests.
2. Extract consent and enforce verified operation approval through application ports; fix #328's
   settlement and cancellation gaps before adapting its UI.
3. Exercise the same contract with OTel and the execution observer. Verify instrumentation failure
   isolation and trace privacy before wiring React subscriptions.
4. Add registration-only React APIs and explicit native/SDK adapters. Run compatibility, browser,
   package, and production benchmark lanes, then update public examples with measured results.

Stabilize after both enforcement and observation pass the same conformance suite across the
covered adapters. Publish implementation changes and API migration notes separately from this RFC.

## Source notes

At #328 revision `c901c01a9de01fa1299be611f166d665797376c9`, the
[guarded wrapper](https://github.com/WebMCP-org/npm-packages/blob/c901c01a9de01fa1299be611f166d665797376c9/packages/react-webmcp/src/useGuardedWebMCP.ts#L60)
drops execution options and treats denial as a resolved value. The
[broker](https://github.com/WebMCP-org/npm-packages/blob/c901c01a9de01fa1299be611f166d665797376c9/packages/react-webmcp/src/consent-broker.ts#L248)
allows direct approval and calls decision listeners before resolving; a throwing listener can
strand a request. The
[presence helper](https://github.com/WebMCP-org/npm-packages/blob/c901c01a9de01fa1299be611f166d665797376c9/packages/react-webmcp/src/consent-presence.ts#L62)
accepts an assertion ID without cryptographic verification. Its
[annotation mapping](https://github.com/WebMCP-org/npm-packages/blob/c901c01a9de01fa1299be611f166d665797376c9/packages/react-webmcp/src/consent-annotations.ts#L25)
infers behavior from risk/reversibility. These observations motivate the tests above; they are
not claims that the proposed guarantees already exist.

[passkeys]: https://simplewebauthn.dev/docs/packages/server#2-verify-authentication-response
[mcp-meta]: https://modelcontextprotocol.io/specification/2026-07-28/basic#general-fields
[otel-mcp]: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md
[react-store]: https://react.dev/reference/react/useSyncExternalStore
[sdk-run]: https://github.com/WebMCP-org/npm-packages/blob/e4bc3510295d19fdd8653b47a9694b0bfe8c8819/packages/webmcp-ts-sdk/src/browser-server.ts#L396
[sdk-adapters]: https://github.com/WebMCP-org/npm-packages/blob/e4bc3510295d19fdd8653b47a9694b0bfe8c8819/packages/webmcp-ts-sdk/src/browser-server.ts#L248
[interceptors]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2624
[baseline]: https://github.com/WebMCP-org/npm-packages/tree/92071e32a39585fe412de3e4ed651391c47ebcf7/benchmarks/react-hooks
