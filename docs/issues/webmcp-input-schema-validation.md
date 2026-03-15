# Proposal: Specify `inputSchema` validation behavior for tool calls

## Problem

The spec defines `inputSchema` but doesn't say whether the browser validates args against it before `execute`. Chrome 146 doesn't — `inputSchema` is metadata for agent planning, not a runtime contract. Developers are told to validate in `execute` themselves.

## Proposal: adopt the Standard Schema shape as the validation interface

[Standard Schema](https://standardschema.dev) (`v1`) is a minimal interface for runtime validators. Zod, Valibot, ArkType, and Effect already implement it. The shape:

```ts
interface StandardSchemaV1<Input, Output> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
  };
}
```

The browser (or polyfill) ships a built-in JSON Schema validator wrapped in this shape. Plain `inputSchema` objects work exactly as today — the implementation validates args against them before `execute` using its own validator. If a developer passes a Standard Schema-compatible object instead, the implementation calls its `~standard.validate` directly.

```js
// Plain JSON Schema — built-in validator handles it
navigator.modelContext.registerTool({
  name: 'send_email',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
    },
    required: ['to', 'subject'],
  },
  execute: async (args) => {
    // args are already validated against the schema
    return { content: [{ type: 'text', text: `Sent to ${args.to}` }] };
  },
});

// Zod schema — its own validator runs, JSON Schema extracted for agent discovery
navigator.modelContext.registerTool({
  name: 'send_email',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
  }),
  execute: async (args) => {
    // args validated by Zod — .email() and .min(1) are enforced
    return { content: [{ type: 'text', text: `Sent to ${args.to}` }] };
  },
});
```

### Why this over raw JSON Schema validation

The spec doesn't need to pick a JSON Schema draft or require browsers to ship a full validator. The built-in one covers `type`, `required`, `enum`, and property types — that's most tool schemas. But JSON Schema can't express `.email()`, `.min(5)`, or custom business rules, and that's where this shines: if you're already using Zod or Valibot, your own library validates before `execute` runs. You get refinements for free.

Internally everything gets wrapped into `~standard.validate` — plain JSON Schema, Zod, whatever. Same code path, same error shape. And it's fully backwards compatible; `{ type: "object", properties: {...} }` keeps working as-is.

## Questions

1. Should validation be MUST, SHOULD, or MAY for user agents?
2. Should the spec define the error shape when validation fails?
