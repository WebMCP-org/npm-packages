import { SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import type { WebMCPPlugin } from './index.js';

/**
 * Trace each call as a span using the application's OpenTelemetry setup. Installs no SDK or
 * exporter, and records no inputs, results, or error messages.
 */
export function otel({
  tracer = trace.getTracer('@mcp-b/webmcp-plugins'),
}: { tracer?: Tracer } = {}): WebMCPPlugin {
  return {
    name: 'otel',
    aroundExecute: (call, next) =>
      tracer.startActiveSpan(
        `execute_tool ${call.name}`,
        { attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': call.name } },
        async (span) => {
          try {
            return await next();
          } catch (error) {
            if (!call.signal.aborted) {
              span.setStatus({ code: SpanStatusCode.ERROR });
              span.setAttribute('error.type', error instanceof Error ? error.name : 'Error');
            }
            throw error;
          } finally {
            span.end();
          }
        }
      ),
  };
}
