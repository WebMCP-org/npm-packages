import type { ToolExecuteCallbackOptions } from '@mcp-b/webmcp-types';
import { withAbortSignal } from './schema.js';

export interface ToolIdentity {
  readonly instanceId: string;
  readonly name: string;
  readonly registeringOrigin?: string;
}

export interface PreparedOperation {
  readonly tool: ToolIdentity;
  readonly arguments: unknown;
  readonly binding: unknown;
}

export type Caller =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'reported'; readonly name: string }
  | { readonly kind: 'verified'; readonly subject: string; readonly authority: string };

export interface InvocationOptions {
  protocol?: 'local' | 'webmcp' | 'mcp';
  mcp?: Readonly<{ protocolVersion?: string; requestId?: string }>;
  signal?: AbortSignal;
  forAgent?: boolean;
  caller?: Caller;
  traceContext?: Readonly<{ traceparent?: string; tracestate?: string; baggage?: string }>;
}

export interface InvocationContext {
  readonly protocol: NonNullable<InvocationOptions['protocol']>;
  readonly mcp?: InvocationOptions['mcp'];
  readonly id: string;
  readonly tool: ToolIdentity;
  readonly signal: AbortSignal;
  readonly caller: Caller;
  readonly traceContext: NonNullable<InvocationOptions['traceContext']>;
  prepare(): Promise<PreparedOperation>;
}

export interface InvocationResult<T> {
  readonly value: T;
  readonly response: unknown;
}

export type InvocationFailureKind =
  | 'denied'
  | 'cancelled'
  | 'invalid_input'
  | 'tool_error'
  | 'format_error'
  | 'middleware_error';

/** Typed failures for middleware; adapters expose the original cause to their callers. */
export class InvocationFailure extends Error {
  declare readonly response?: unknown;
  constructor(
    readonly kind: InvocationFailureKind,
    override readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'InvocationFailure';
  }
}

export type AroundInvoke<T = unknown> = (
  call: InvocationContext,
  next: () => Promise<InvocationResult<T>>
) => Promise<InvocationResult<T>>;

/** Optional preparation plugin. JSON Schema metadata alone does not install a validator. */
export interface InputAdapter<TInput, TValidated> {
  readonly inputSchema?: object;
  validate: (input: TInput) => TValidated | Promise<TValidated>;
}

interface InvocationDefinition<TValidated, TResult> {
  /** Optional owner lifetime, combined with the individual call's cancellation. */
  signal?: AbortSignal;
  tool: ToolIdentity;
  execute: (input: TValidated, options: ToolExecuteCallbackOptions) => TResult | Promise<TResult>;
  middleware?: readonly AroundInvoke<TResult>[];
  /** Serializable approval description for schemas producing non-JSON values. */
  binding?: (input: TValidated) => unknown;
  /** Recheck the captured registration/connection immediately before execution. */
  checkBinding?: () => void;
  formatOutput?: (result: TResult) => unknown;
  formatError?: (error: Error) => unknown;
  /** Only protocol adapters classify protocol error responses. */
  isErrorResponse?: (response: unknown) => boolean;
}

/** An adapter is required when the accepted input cannot be passed directly to the executor. */
export type InvocationConfig<TInput, TValidated, TResult> = InvocationDefinition<
  TValidated,
  TResult
> &
  ([TInput] extends [TValidated]
    ? { input?: InputAdapter<TInput, TValidated> }
    : { input: InputAdapter<TInput, TValidated> });

/** Snapshot plain data and Date/Map/Set without silently stripping custom prototypes. */
function cloneInputSnapshot<T>(input: T): T {
  const seen = new Set<object>();
  const check = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      prototype === Object.prototype ||
      prototype === null ||
      (prototype === Array.prototype && Array.isArray(value))
    ) {
      for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (typeof key === 'symbol' || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('Input snapshots require enumerable string-keyed data properties');
        }
        check(descriptor.value);
      }
      return;
    }
    if (
      prototype !== Date.prototype &&
      prototype !== Map.prototype &&
      prototype !== Set.prototype
    ) {
      throw new TypeError(
        'Custom instances cannot be snapshotted; use plain data, Date, Map, or Set'
      );
    }
    if (Reflect.ownKeys(value).length > 0) {
      throw new TypeError('Date, Map, and Set snapshots cannot contain custom properties');
    }
    if (value instanceof Map)
      for (const [key, item] of value) {
        check(key);
        check(item);
      }
    if (value instanceof Set) for (const item of value) check(item);
  };
  check(input);
  return structuredClone(input);
}

/** @internal Snapshot approval data without lossy JSON serialization. */
export function immutableJson(value: unknown, seen = new Set<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    throw new TypeError('Approval data must be finite, acyclic JSON');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new TypeError('Approval arrays must be dense and have no extra properties');
      }
      return Object.freeze(value.map((item) => immutableJson(item, seen)));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Non-JSON validated inputs require an explicit approval binding');
    }
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, immutableJson(item, seen)])
      )
    );
  } finally {
    seen.delete(value);
  }
}

/** Invoke a captured tool through optional middleware, independently of browser installation. */
export async function invoke<TInput, TValidated = TInput, TResult = unknown>(
  config: InvocationConfig<TInput, TValidated, TResult>,
  input: TInput,
  options: InvocationAdapterContext = {}
): Promise<InvocationResult<TResult>> {
  options = { ...options };
  config = {
    ...config,
    tool: Object.freeze({ ...config.tool }),
    middleware: [...(config.middleware ?? [])],
  };
  let captured: { value: TInput } | { error: unknown };
  const validate = config.input?.validate.bind(config.input);
  try {
    captured = { value: cloneInputSnapshot(input) };
  } catch (error) {
    captured = { error };
  }
  const lifetime = new AbortController();
  const signals = [
    lifetime.signal,
    ...(options.signal ? [options.signal] : []),
    ...(config.signal ? [config.signal] : []),
  ];
  const signal = signals.length === 1 ? lifetime.signal : AbortSignal.any(signals);
  let terminal: { result: InvocationResult<TResult> } | { error: InvocationFailure } | undefined;
  const pendingCancellation = new AbortController();
  const onAbort = () => {
    if (!terminal) pendingCancellation.abort(signal.reason);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  const cancellation = () =>
    signal.reason instanceof InvocationFailure
      ? signal.reason
      : new InvocationFailure('cancelled', signal.reason);
  const check = () => {
    if (signal.aborted && !terminal) throw cancellation();
  };
  const failure = (cause: unknown, kind: InvocationFailureKind): InvocationFailure =>
    signal.aborted && !terminal
      ? cancellation()
      : cause instanceof InvocationFailure
        ? cause
        : new InvocationFailure(kind, cause);
  const formatted = new WeakMap<InvocationFailure, Promise<InvocationFailure>>();
  const stage = async <T>(action: () => T | Promise<T>): Promise<T> => {
    check();
    const result = await withAbortSignal(
      Promise.resolve().then(() => {
        check();
        return action();
      }),
      pendingCancellation.signal,
      cancellation
    );
    check();
    return result;
  };
  const formatFailure = (cause: unknown): Promise<InvocationFailure> => {
    const error = failure(cause, 'middleware_error');
    if (
      !options.forAgent ||
      !config.formatError ||
      error.kind === 'cancelled' ||
      'response' in error
    )
      return Promise.resolve(error);
    const existing = formatted.get(error);
    if (existing) return existing;
    const result = stage(async () => {
      let response = await config.formatError!(
        error.cause instanceof Error ? error.cause : new Error(String(error.cause))
      );
      check();
      if (options.formatOutput) response = await options.formatOutput(response);
      check();
      Object.defineProperty(error, 'response', { value: response, enumerable: true });
      return error;
    }).catch((cause: unknown) => {
      const formattingError = failure(cause, 'format_error');
      formatted.set(formattingError, Promise.resolve(formattingError));
      return formattingError;
    });
    formatted.set(error, result);
    return result;
  };
  let validated: TValidated;
  let validation: Promise<void> | undefined;
  let prepared: Promise<PreparedOperation> | undefined;
  const prepareInput = () =>
    (validation ??= stage(async () => {
      if ('error' in captured) throw captured.error;
      if (options.validateInput) await options.validateInput(captured.value);
      check();
      // No adapter means the accepted and executable inputs have the same type.
      validated = (validate ? await validate(captured.value) : captured.value) as TValidated;
      check();
    }).catch((cause: unknown) => {
      throw failure(cause, 'invalid_input');
    }));
  const call: InvocationContext = Object.freeze({
    protocol: options.protocol ?? (options.forAgent ? 'webmcp' : 'local'),
    ...(options.mcp && { mcp: Object.freeze({ ...options.mcp }) }),
    id: crypto.randomUUID(),
    tool: config.tool,
    signal,
    caller: Object.freeze(options.caller ? { ...options.caller } : { kind: 'unknown' as const }),
    traceContext: Object.freeze({ ...options.traceContext }),
    prepare: () =>
      (prepared ??= stage(async () => {
        await prepareInput();
        validated = cloneInputSnapshot(validated);
        const binding = config.binding
          ? immutableJson(config.binding(cloneInputSnapshot(validated)))
          : undefined;
        let argumentsSnapshot: unknown;
        try {
          argumentsSnapshot = immutableJson(validated);
        } catch (error) {
          if (!config.binding) throw error;
        }
        return Object.freeze({ tool: config.tool, arguments: argumentsSnapshot, binding });
      })),
  });
  const dispatch = async (index: number): Promise<InvocationResult<TResult>> => {
    try {
      check();
      const middleware = config.middleware?.[index];
      if (middleware) {
        let called = false;
        let closed = false;
        let outcome: { value: InvocationResult<TResult> } | { error: unknown } | undefined;
        try {
          const result = await stage(() =>
            middleware(call, () => {
              if (signal.aborted) return Promise.reject(cancellation());
              if (called || closed)
                return Promise.reject(
                  new InvocationFailure(
                    'middleware_error',
                    new Error('next() may only be called once during middleware execution')
                  )
                );
              called = true;
              const continuation = dispatch(index + 1).then(
                (value) => {
                  outcome = { value };
                  return value;
                },
                (error: unknown) => {
                  outcome = { error };
                  throw error;
                }
              );
              // A broken middleware may abandon its continuation; still observe its rejection.
              void continuation.catch(() => {});
              return continuation;
            })
          );
          if (!outcome) {
            const error = new InvocationFailure(
              'middleware_error',
              new Error('Middleware must await and return next()')
            );
            lifetime.abort(error);
            throw error;
          }
          if ('error' in outcome) throw outcome.error;
          if (result !== outcome.value)
            throw new InvocationFailure(
              'middleware_error',
              new Error('Middleware must preserve the invocation result')
            );
          return result;
        } catch (cause) {
          if (called && !outcome) lifetime.abort(failure(cause, 'middleware_error'));
          throw cause;
        } finally {
          closed = true;
        }
      }
      await prepareInput();
      check();
      const value = await stage(() => {
        try {
          config.checkBinding?.();
        } catch (cause) {
          throw failure(cause, 'denied');
        }
        return config.execute(validated, { signal });
      }).catch((cause: unknown) => {
        throw failure(cause, 'tool_error');
      });
      if (value instanceof Error) throw failure(value, 'tool_error');
      let response =
        options.forAgent && config.formatOutput
          ? await stage(() => config.formatOutput!(value)).catch((cause: unknown) => {
              throw failure(cause, 'format_error');
            })
          : value;
      if (options.forAgent && options.formatOutput) {
        response = await stage(() => options.formatOutput!(response)).catch((cause: unknown) => {
          throw failure(cause, 'format_error');
        });
      }
      if (
        options.forAgent &&
        (config.isErrorResponse?.(response) || options.isErrorResponse?.(response))
      ) {
        const error = new InvocationFailure(
          'tool_error',
          new Error('Tool returned an error response')
        );
        Object.defineProperty(error, 'response', { value: response, enumerable: true });
        throw error;
      }
      check();
      const result = Object.freeze({ value, response });
      terminal = { result };
      return result;
    } catch (cause) {
      // A notification may synchronously abort the caller after the effect has settled.
      // Keep state, tracing, and delivery on that completed outcome during unwind.
      if (signal.aborted && terminal) {
        if ('result' in terminal) return terminal.result;
        throw terminal.error;
      }
      const error = await formatFailure(cause);
      terminal ??= { error };
      throw error;
    }
  };
  try {
    return await dispatch(0);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/** Trusted in-process protocol context; never read from tool arguments or a wire bypass flag. */
export interface InvocationAdapterContext extends InvocationOptions {
  validateInput?: (input: unknown) => Promise<unknown>;
  formatOutput?: (result: unknown) => unknown;
  isErrorResponse?: (response: unknown) => boolean;
}

const callbacks = new WeakSet<object>();
const callbackContexts = new WeakMap<ToolExecuteCallbackOptions, InvocationAdapterContext>();

/** Create the explicitly managed callback used by native WebMCP, React, and the MCP bridge. */
export function createInvocationCallback<TInput, TValidated = TInput, TResult = unknown>(
  getConfig: (
    input: unknown,
    options: ToolExecuteCallbackOptions
  ) => InvocationConfig<TInput, TValidated, TResult>
): (input: unknown, options?: ToolExecuteCallbackOptions) => Promise<unknown> {
  const callback = (
    input: unknown,
    options: ToolExecuteCallbackOptions = { signal: new AbortController().signal }
  ) =>
    unwrapInvocation(
      // Browser callbacks receive untrusted input. Preparation owns its validation;
      // the generic only describes the input accepted by typed local callers.
      invoke(getConfig(input, options), input as TInput, {
        ...callbackContexts.get(options),
        signal: options.signal,
        forAgent: true,
      }),
      true
    );
  callbacks.add(callback);
  return callback;
}

/** @internal Identify runner-owned callbacks without trusting serialized metadata. */
export function isInvocationCallback(callback: unknown): boolean {
  return typeof callback === 'function' && callbacks.has(callback);
}

/** @internal Supply protocol context to an explicitly managed callback. */
export async function invokeCallback<TInput>(
  callback: (input: TInput, options?: ToolExecuteCallbackOptions) => unknown,
  input: TInput,
  options: ToolExecuteCallbackOptions,
  context: InvocationAdapterContext
): Promise<unknown> {
  const scopedOptions = { ...options };
  callbackContexts.set(scopedOptions, context);
  try {
    return await callback(input, scopedOptions);
  } finally {
    callbackContexts.delete(scopedOptions);
  }
}

/** Deliver the runner's already formatted response, or the original local result/error. */
export async function unwrapInvocation<T>(
  invocation: Promise<InvocationResult<T>>,
  forAgent?: false
): Promise<T>;
export async function unwrapInvocation<T>(
  invocation: Promise<InvocationResult<T>>,
  forAgent: boolean
): Promise<unknown>;
export async function unwrapInvocation<T>(
  invocation: Promise<InvocationResult<T>>,
  forAgent = false
): Promise<unknown> {
  try {
    const result = await invocation;
    return forAgent ? result.response : result.value;
  } catch (error) {
    if (!(error instanceof InvocationFailure)) throw error;
    if (forAgent && 'response' in error) return error.response;
    if (error.kind === 'cancelled') throw error.cause;
    throw error.cause instanceof Error ? error.cause : new Error(String(error.cause));
  }
}
