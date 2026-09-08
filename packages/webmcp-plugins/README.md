# @mcp-b/webmcp-plugins

Validation, consent, execution state, and tracing for WebMCP callbacks. Works with native
WebMCP, the polyfill, and the MCP bridge, independently of React.

```ts
import { invoke } from '@mcp-b/webmcp-plugins';
import { standardSchema } from '@mcp-b/webmcp-plugins/standard-schema';
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';
import { z } from 'zod';

const input = standardSchema(z.object({ count: z.string().regex(/^\d+$/).transform(Number) }));
const execution = executionState<number>();

const result = await invoke(
  {
    tool: { instanceId: crypto.randomUUID(), name: 'double' },
    input,
    plugins: [execution],
    execute: ({ count }) => count * 2,
  },
  { count: '3' }
);

console.log(result.value); // 6
console.log(execution.getSnapshot().executionCount); // 1
```

```bash
pnpm add @mcp-b/webmcp-plugins
# Only for the example's schema implementation:
pnpm add zod@^4.2
```

Importing this package does not install `document.modelContext`, a validator engine, or an
OpenTelemetry provider. [React hooks](../usewebmcp/README.md) already use its runner and select
the Standard Schema adapter when passed a compatible `inputSchema`.

## Entries

| Import                  | Exports                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `@mcp-b/webmcp-plugins` | `invoke`, `createInvocationCallback`, `unwrapInvocation`, `InvocationFailure`, runner and plugin types |
| `/standard-schema`      | `standardSchema(schema)` and schema conversion/validation helpers                                      |
| `/execution-state`      | `executionState<T>()`, `ExecutionState<T>`, `ToolExecutionState<T>`, `INITIAL_EXECUTION_STATE`         |
| `/consent`              | `consent({ broker })`, `ConsentBroker`, consent request/options types                                  |
| `/otel`                 | `otel(options)`, `OtelOptions`                                                                         |

## Named plugins

A plugin has a diagnostic `name` and one `aroundInvoke(call, next)` function:

```ts
import type { WebMCPPlugin } from '@mcp-b/webmcp-plugins';

const plugin: WebMCPPlugin = {
  name: 'my-app:invocation',
  async aroundInvoke(_call, next) {
    return next();
  },
};
```

Pass plugin objects through `plugins: [...]`. The first is outermost. For
`[tracing, execution, consent({ broker })]`, tracing and state include validation, approval
waiting, execution, and response formatting. Place observers before gates to record denied calls.

`next()` takes no replacement arguments and can run once. Plugins must await or return it
and preserve its result. A saved continuation cannot start work after its plugin has returned.
A plugin can reject an invocation; it cannot turn denial or cancellation into success.
Names are labels, not permissions or a plugin registry.

`call` exposes `id`, `tool`, `signal`, `protocol`, `caller`, `traceContext`, optional `mcp`
metadata, and `prepare()`. Preparation validates and transforms input once, then produces an
immutable approval operation. Consent always awaits preparation. Validation is a runner stage,
so rearranging plugins cannot approve unvalidated arguments.

## Standard Schema

`standardSchema(schema)` returns the typed `input` adapter and its projected `inputSchema`.
The schema must implement both [Standard Schema v1](https://standardschema.dev/) and
[Standard JSON Schema v1](https://standardschema.dev/json-schema).

Conversion calls `~standard.jsonSchema.input()`, trying draft 2020-12 then draft-07.
Each invocation calls the supplied `~standard.validate()` once and awaits async validation.
Callers supply the input type; the executor receives the validated output, including defaults
and transforms. Plain JSON Schema metadata does not install a validator.

Input adaptation is configured through `input`, separately from the ordered plugin list.
A custom `InputAdapter<TInput, TValidated>` provides `validate(input)` and optional JSON Schema
metadata. An adapter is required when the executor cannot accept the original input type.

## Execution state

```ts
import { executionState } from '@mcp-b/webmcp-plugins/execution-state';

const execution = executionState<string>();
const unsubscribe = execution.subscribe(() => {
  console.log(execution.getSnapshot());
});
// Attach execution through the tool's plugins array.
// Call unsubscribe() when this subscriber is no longer needed.
```

The returned store is itself a named plugin. Create one per tool owner. Its snapshot contains:

| Field            | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| `isExecuting`    | At least one invocation remains pending                        |
| `lastResult`     | Most recently completed successful raw value, initially `null` |
| `error`          | Most recently observed failure, initially `null`               |
| `executionCount` | Number of successful completions                               |

State is recorded even with no subscribers. `reset()` clears observations without cancelling
pending work. Unsubscribing preserves the store. Optional `onDiagnostic(error)` reports listener
failures; observers cannot change tool outcomes.

React subscription is separate: [`useToolExecutionState(execution)`](../usewebmcp/README.md#subscribe-only-where-state-is-displayed)
renders only the subscribing component when the snapshot changes. `useWebMCP` never creates
or subscribes to an execution store implicitly.

## Consent

```ts
import { ConsentBroker, consent } from '@mcp-b/webmcp-plugins/consent';

const broker = new ConsentBroker({ policy: { mode: 'click' } });
const approval = consent({ broker });
// Attach approval through plugins: [approval].

const unsubscribe = broker.subscribe(() => {
  console.log(broker.getSnapshot()); // Render these pending requests in your UI.
});
// From the user's decision handler: await broker.decide(request.id, { approved: true });
```

`consent({ broker })` waits for prepared arguments and authorization before continuing.
`broker.getSnapshot()` returns pending requests with `id`, `invocationId`, immutable `operation`,
`caller`, and `expiresAt`. `decide(id, { approved, proof? })` returns `true` only for a live,
approved request. Denial, expiry, failed verification, duplicate decisions, and replay return `false`.
Cancellation removes the request and aborts outstanding verification.

| Broker option                          | Behavior                                                           |
| -------------------------------------- | ------------------------------------------------------------------ |
| `policy: { mode: 'click' }`            | Explicit local UI approval                                         |
| `policy: { mode: 'verified', verify }` | Requires `verify(request, proof, signal)` to return literal `true` |
| `timeoutMs`                            | Positive approval deadline up to 2147483647 ms; default 120000     |
| `onDiagnostic`                         | Optional subscriber error handler                                  |

Verified mode delegates verification to the application. A trusted server must verify and consume
a fresh challenge bound to the operation and user. For passkeys this includes the credential key,
origin, RP ID, and required user verification. The protected executor must consume a grant for the
same operation. An assertion ID is not verification; unsupported hardware cannot downgrade the
policy to click approval. See the [security model](https://docs.mcp-b.ai/explanation/design/security-and-human-in-the-loop).

### Approval snapshots

Raw inputs support plain objects, arrays, `Date`, `Map`, and `Set`. Custom instances, symbol keys,
accessors, and nonenumerable data properties are rejected instead of silently losing fields.
Vendor validator outputs retain their types until a plugin calls `prepare()`.

Approval preparation privately copies supported values. Automatic approval arguments must be
finite, acyclic JSON, with dense arrays and no extra array properties. For `Date`, `Map`, `Set`,
or other supported non-JSON data, provide `binding(input)` returning a complete JSON description
of the operation. Such operations have `arguments: undefined` and the explicit `binding`.
Transformed custom classes cannot be prepared even with a binding.

`checkBinding()` rechecks current registration or authority immediately before execution.
Approval covers the captured handler, arguments, and binding. Cancellation prevents a pending
operation from starting; it cannot undo an effect that already ran.

## OpenTelemetry

```ts
import { trace } from '@opentelemetry/api';
import { otel } from '@mcp-b/webmcp-plugins/otel';

const tracing = otel({ tracer: trace.getTracer('my-app') });
// Attach tracing before consent through plugins: [tracing, approval].
```

Install the optional `@opentelemetry/api` peer when importing `/otel`. Supply your tracer and
configured context manager; the plugin installs no SDK, provider, or exporter.
`OtelOptions` accepts required `tracer` and optional `propagator`, `parentContext(call)`, and
`onDiagnostic(error)`.

Trusted MCP adapter calls produce MCP server spans and may extract configured trace context.
Other calls produce WebMCP internal spans. The plugin records tool identity and outcome kinds;
it omits arguments, results, approval data, and error messages. Instrumentation failures cannot
change tool outcomes. Omit this plugin if another integration already owns the invocation span.

## Register a callback outside React

`createInvocationCallback(getConfig)` returns a browser `execute` callback. Each call captures
configuration from `getConfig(input, options)`. Use the same registration signal for the runner
and browser registration:

```ts
import { createInvocationCallback } from '@mcp-b/webmcp-plugins';
import { standardSchema } from '@mcp-b/webmcp-plugins/standard-schema';
import { z } from 'zod';

const context = document.modelContext;
if (!context) throw new Error('Initialize WebMCP before registering tools');
const registration = new AbortController();
const tool = { instanceId: crypto.randomUUID(), name: 'double' };
const input = standardSchema(z.object({ count: z.number() }));

await context.registerTool(
  {
    name: tool.name,
    description: 'Double a number',
    inputSchema: input.inputSchema,
    execute: createInvocationCallback(() => ({
      tool,
      input,
      signal: registration.signal,
      execute: ({ count }) => count * 2,
    })),
  },
  { signal: registration.signal }
);
// Call registration.abort() during cleanup.
```

Only wrapped callbacks participate. Existing native tools, declarative forms, and direct calls
that bypass the wrapper are unaffected. Browser-required checks remain in the browser/polyfill.
The [MCP bridge](../webmcp-ts-sdk/README.md) recognizes managed callbacks in process, validates
MCP input/output inside the invocation, and preserves one vendor transformation per call.

Keep one installed runner instance shared by hooks and the SDK. Published consumers externalize
this package; do not independently bundle private copies into those integrations. Callback ownership
and trusted adapter context use module-local identity, never fields supplied in tool arguments.

## Runner API and outcomes

`invoke(config, input, options?)` returns `Promise<InvocationResult<T>>` with raw `value` and
prepared `response`. `unwrapInvocation(promise)` returns the local value and original failure;
`unwrapInvocation(promise, true)` delivers the prepared agent response.

`InvocationConfig` accepts `tool`, `execute`, optional `input`, `plugins`, owner `signal`,
`binding`, `checkBinding`, `formatOutput`, and `formatError`. `tool` contains `instanceId`,
`name`, and optional `registeringOrigin`. Executors receive `(input, { signal })`.
`options.signal` cancels one call; `forAgent: true` enables agent formatting. Local calls skip
agent formatters. Formats may be asynchronous and complete before the invocation settles.

`InvocationFailure.kind` is `denied`, `cancelled`, `invalid_input`, `tool_error`, `format_error`,
or `middleware_error`. It retains `cause` and an optional formatted `response`. Protocol adapters
classify actual MCP error responses as tool failures; arbitrary local objects containing `isError`
remain data. Protocol metadata and caller provenance belong to trusted adapters; absent caller
identity is `unknown`.

## Migration from the polyfill entries

The old polyfill invocation entries are removed. Import the runner from this package's root and
plugins from its subpaths. Replace `middleware` functions with named `plugins`,
`createExecutionState()` with `executionState()`, `createOtelMiddleware()` with `otel()`, and
`broker.aroundInvoke` with `consent({ broker })`. There are no compatibility aliases.

## License

[MIT](../../LICENSE)
