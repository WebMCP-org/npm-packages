import {
  ROOT_CONTEXT,
  context,
  trace,
  defaultTextMapGetter,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  type TextMapPropagator,
  type Attributes,
  type Context,
  isSpanContextValid,
} from '@opentelemetry/api';
import { InvocationFailure, type InvocationContext, type InvocationResult } from './invocation.js';

export interface OtelMiddlewareOptions {
  tracer: Tracer;
  /** Used only with trusted MCP adapter metadata, independently of tool arguments. */
  propagator?: TextMapPropagator;
  parentContext?: (call: InvocationContext) => Context;
  onDiagnostic?: (error: unknown) => void;
}

/**
 * Optional tracing with the application's tracer and context manager; installs no SDK or exporter.
 * Payloads, approval data, and error messages are never captured. Omit this middleware when an
 * enclosing instrumentation already owns the invocation span. MCP conventions are Development.
 */
export function createOtelMiddleware(options: OtelMiddlewareOptions) {
  function observe<T>(work: () => T): T | undefined {
    try {
      return work();
    } catch (error) {
      try {
        options.onDiagnostic?.(error);
      } catch {
        /* Diagnostics cannot change an invocation outcome. */
      }
      return undefined;
    }
  }
  return async <T>(
    call: InvocationContext,
    next: () => Promise<InvocationResult<T>>
  ): Promise<InvocationResult<T>> => {
    const mcp = call.protocol === 'mcp';
    const ambient =
      observe(() => options.parentContext?.(call) ?? context.active()) ?? ROOT_CONTEXT;
    const parent =
      observe(() =>
        mcp && options.propagator
          ? options.propagator.extract(ambient, call.traceContext, defaultTextMapGetter)
          : ambient
      ) ?? ambient;
    const links = observe(() => {
      const ambientSpan = trace.getSpanContext(ambient);
      const parentSpan = trace.getSpanContext(parent);
      return mcp &&
        ambientSpan &&
        parentSpan &&
        isSpanContextValid(ambientSpan) &&
        isSpanContextValid(parentSpan) &&
        (ambientSpan.traceId !== parentSpan.traceId || ambientSpan.spanId !== parentSpan.spanId)
        ? [{ context: ambientSpan }]
        : undefined;
    });
    const attributes: Attributes = mcp
      ? {
          'mcp.method.name': 'tools/call',
          'gen_ai.tool.name': call.tool.name,
          'gen_ai.operation.name': 'execute_tool',
          ...(call.mcp?.protocolVersion === undefined
            ? {}
            : { 'mcp.protocol.version': call.mcp.protocolVersion }),
          ...(call.mcp?.requestId === undefined
            ? {}
            : { 'jsonrpc.request.id': call.mcp.requestId }),
        }
      : { 'webmcp.tool.name': call.tool.name };
    const span = observe(() =>
      options.tracer.startSpan(
        `${mcp ? 'tools/call' : 'webmcp.invoke'} ${call.tool.name}`,
        {
          kind: mcp ? SpanKind.SERVER : SpanKind.INTERNAL,
          attributes,
          ...(links ? { links } : {}),
        },
        parent
      )
    );
    let downstream: Promise<InvocationResult<T>> | undefined;
    const proceed = (): Promise<InvocationResult<T>> => {
      if (!downstream) {
        try {
          downstream = next();
        } catch (error) {
          downstream = Promise.reject(error);
        }
      }
      return downstream;
    };
    if (span) observe(() => context.with(trace.setSpan(parent, span), proceed));
    try {
      const result = await proceed();
      observe(() => span?.setAttribute('webmcp.invocation.outcome', 'success'));
      return result;
    } catch (error) {
      const kind = error instanceof InvocationFailure ? error.kind : 'middleware_error';
      observe(() => span?.setAttribute('webmcp.invocation.outcome', kind));
      observe(() => span?.setAttribute('error.type', kind));
      observe(() =>
        span?.setStatus({
          code: kind === 'cancelled' ? SpanStatusCode.UNSET : SpanStatusCode.ERROR,
        })
      );
      throw error;
    } finally {
      observe(() => span?.end());
    }
  };
}
