# @mcp-b/webmcp-polyfill

Use native WebMCP when available, with a core fallback for other browsers:

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';

initializeWebMCPPolyfill();
const context = document.modelContext;
if (!context) throw new Error('WebMCP is unavailable');

await context.registerTool({
  name: 'get-page-title',
  description: 'Return the current page title',
  execute: () => ({ title: document.title }),
});
```

```bash
pnpm add @mcp-b/webmcp-polyfill
```

Initialization preserves an existing native context. The ESM import has no initialization
side effect. [WebMCP](https://webmachinelearning.github.io/webmcp/) is a Community Group
proposal; MCP prompts, resources, and transport belong to [`@mcp-b/global`](../global/README.md).

## Invocation plugins

Experimental, unreleased entry points add validation, consent, tracing, and execution state
to callbacks you explicitly wrap. They work with both native WebMCP and the fallback.

```ts
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import { createInvocationCallback } from '@mcp-b/webmcp-polyfill/invocation';
import { standardSchema } from '@mcp-b/webmcp-polyfill/standard-schema';
import { createExecutionState } from '@mcp-b/webmcp-polyfill/execution-state';
import { z } from 'zod';

initializeWebMCPPolyfill();
const context = document.modelContext;
if (!context) throw new Error('WebMCP is unavailable');

const input = standardSchema(z.object({ count: z.string().regex(/^\d+$/).transform(Number) }));
const state = createExecutionState<{ total: number }>();
const registration = new AbortController();
const tool = { instanceId: crypto.randomUUID(), name: 'calculate_total' };

const execute = createInvocationCallback(() => ({
  tool,
  input,
  signal: registration.signal,
  middleware: [state.aroundInvoke],
  execute: ({ count }) => ({ total: count + 10 }),
}));

await context.registerTool(
  {
    name: tool.name,
    description: 'Add 10 to a numeric count',
    inputSchema: input.inputSchema,
    execute,
  },
  { signal: registration.signal }
);

// Retain registration.abort() for cleanup and state.getSnapshot() for your UI.
```

This example uses Zod 4.2 or newer. `standardSchema()` calls the supplied
`~standard.validate()` once per invocation and passes its transformed value to the handler.
It uses `~standard.jsonSchema.input()` for metadata. No validation engine ships with the plugin;
plain JSON Schema metadata alone does not install validation.

Raw inputs support plain data, arrays, `Date`, `Map`, and `Set`; custom class instances and
enumerable accessors are rejected. Validator outputs pass through unchanged until middleware
calls `prepare()`. Consent preparation requires a JSON `binding` for `Date`, `Map`, and `Set`
and rejects transformed custom class instances.

| Entry after `@mcp-b/webmcp-polyfill` | Exports and purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `/invocation`                        | `invoke`, `createInvocationCallback`, `unwrapInvocation`, middleware types |
| `/standard-schema`                   | `standardSchema` input validation and metadata adapter                     |
| `/execution-state`                   | `createExecutionState` with optional subscribers                           |
| `/consent`                           | `ConsentBroker` with explicit click or required verification policy        |
| `/otel`                              | `createOtelMiddleware` using your OpenTelemetry tracer                     |
| `/schema`                            | Existing low-level schema and browser compatibility helpers                |

The first middleware is outermost. For `[otel, state.aroundInvoke, broker.aroundInvoke]`,
observers include validation, consent wait, execution, and agent response formatting.
Consent sees an immutable snapshot of final validated arguments. `next()` takes no replacement
arguments and can run only once. An omitted state plugin allocates no execution state;
an attached state plugin records calls even without subscribers.

`ConsentBroker` owns pending requests, cancellation, expiry, and one-use decisions.
Your UI subscribes to `getSnapshot()` and calls `decide()`. A `mode: 'verified'` policy
requires your verification callback; passkey verification and operation-bound grants remain
server responsibilities. An assertion ID or unsupported hardware cannot substitute for
verification. See the [consent reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference#consentbroker).

The OTel plugin requires the optional `@opentelemetry/api` peer and an application tracer.
It installs no provider or exporter and captures no arguments, results, approval data,
or error messages. It emits MCP spans only for calls identified by the trusted MCP adapter.

These plugins cover wrapped callbacks. They do not intercept existing native registrations,
declarative forms, or direct application calls that bypass the wrapper. Browser-required access,
coercion, registration, and cancellation checks remain in the core. The
[React hooks](../usewebmcp/README.md) use this same invocation runtime.

## Script tags and forms

The standalone script initializes on load:

```html
<script src="https://unpkg.com/@mcp-b/webmcp-polyfill@latest/dist/index.iife.js"></script>
```

When the fallback owns `document.modelContext`, it registers annotated forms in the document
and open shadow roots and keeps their metadata synchronized with DOM changes:

```html
<form toolname="search_catalog" tooldescription="Search the product catalog" toolautosubmit>
  <label>Query <input name="query" required /></label>
  <button type="submit">Search</button>
</form>
```

`toolautosubmit` applies browser form validation and calls `requestSubmit()`. Without it,
invocation fills the form and waits for a user submission. See the
[declarative reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference#declarative-forms)
for responding to agent submissions and the supported subset of Chrome's declarative API.

## Compatibility

- `document.modelContext` is canonical; `navigator.modelContext` is a deprecated alias.
- Registration lifetime belongs to its `AbortSignal`; aborting removes the tool.
- The package's `executeTool()` compatibility path takes serialized JSON. The
  [live draft](https://webmachinelearning.github.io/webmcp/) specifies object input.
- Cross-document discovery and exposure require native WebMCP.
- Native CSS tool-state pseudo-classes, `toolcancel`, cross-navigation responses,
  file inputs, custom form-associated elements, and closed shadow roots are not emulated.
- `initializeWebMCPPolyfill({ installTestingShim: true })` enables the legacy testing shim.
- `cleanupWebMCPPolyfill()` removes fallback registrations and restores changed properties.

[API reference](https://docs.mcp-b.ai/packages/webmcp-polyfill/reference) ·
[Runtime layering](https://docs.mcp-b.ai/explanation/architecture/runtime-layering) ·
[Schema guide](https://docs.mcp-b.ai/how-to/use-schemas-and-structured-output)

## License

MIT
