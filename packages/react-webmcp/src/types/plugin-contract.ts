// TODO(#332): delete this file once #332 merges; replace imports with
// the real exports from @mcp-b/webmcp-plugins.
//
// This is a temporary local shim so the consent-layer plugin work
// (tasks 01 and 02) compiles and tests pass independent of #332's
// in-progress code. Shapes are matched against the current head of
// upstream/alex/invocation-runtime as of 2026-09-09.

// ---------------------------------------------------------------------------
// Tool identity
// ---------------------------------------------------------------------------

export interface ToolIdentity {
  readonly instanceId: string;
  readonly name: string;
  readonly registeringOrigin?: string;
}

// ---------------------------------------------------------------------------
// Prepared operation (frozen snapshot of a tool call before execution)
// ---------------------------------------------------------------------------

export interface PreparedOperation {
  readonly tool: ToolIdentity;
  readonly arguments: unknown;
  readonly binding: unknown;
}

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

export type Caller =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'reported'; readonly name: string }
  | { readonly kind: 'verified'; readonly subject: string; readonly authority: string };

// ---------------------------------------------------------------------------
// Invocation context (passed to aroundInvoke as `call`)
// ---------------------------------------------------------------------------

export interface InvocationContext {
  readonly protocol: 'local' | 'webmcp' | 'mcp';
  readonly mcp?: Readonly<{ protocolVersion?: string; requestId?: string }>;
  readonly id: string;
  readonly tool: ToolIdentity;
  readonly signal: AbortSignal;
  readonly caller: Caller;
  readonly traceContext: Readonly<{ traceparent?: string; tracestate?: string; baggage?: string }>;
  prepare(): Promise<PreparedOperation>;
}

// ---------------------------------------------------------------------------
// Invocation result
// ---------------------------------------------------------------------------

export interface InvocationResult<T> {
  readonly value: T;
  readonly response: unknown;
}

// ---------------------------------------------------------------------------
// Invocation failure
// ---------------------------------------------------------------------------

export type InvocationFailureKind =
  | 'denied'
  | 'cancelled'
  | 'invalid_input'
  | 'tool_error'
  | 'format_error'
  | 'middleware_error';

// ---------------------------------------------------------------------------
// Plugin contract
// ---------------------------------------------------------------------------

/**
 * A plugin reads typed results from next(). The runner verifies that its
 * returned value is that exact result before restoring the result type;
 * observers do not determine tool output.
 */
export type AroundInvoke<in T = unknown> = (
  call: InvocationContext,
  next: () => Promise<InvocationResult<T>>
) => Promise<InvocationResult<unknown>>;

export interface WebMCPPlugin<T = unknown> {
  readonly name: string;
  readonly aroundInvoke: AroundInvoke<T>;
}
