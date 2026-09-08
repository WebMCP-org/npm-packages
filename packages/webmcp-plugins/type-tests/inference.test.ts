import type { Tracer } from '@opentelemetry/api';
import { ConsentBroker, consent } from '../src/consent.js';
import { executionState } from '../src/execution-state.js';
import {
  invoke,
  type InputAdapter,
  type InvocationResult,
  type WebMCPPlugin,
} from '../src/invocation.js';
import { otel } from '../src/otel.js';

/** Checked in both strict and non-strict consumers; this function is never executed. */
export function inferPluginResults(broker: ConsentBroker, tracer: Tracer) {
  const tool = { instanceId: 'inference', name: 'double' };
  const input: InputAdapter<{ count: string }, { count: number }> = {
    validate: ({ count }) => ({ count: Number(count) }),
  };
  const approved: Promise<InvocationResult<number>> = invoke(
    {
      tool,
      input,
      plugins: [consent({ broker })],
      execute: ({ count }) => count * 2,
    },
    { count: '3' }
  );
  const traced: Promise<InvocationResult<number>> = invoke(
    {
      tool,
      input,
      plugins: [otel({ tracer })],
      execute: ({ count }) => count * 2,
    },
    { count: '3' }
  );
  const observed: Promise<InvocationResult<number>> = invoke(
    {
      tool,
      input,
      plugins: [executionState()],
      execute: async ({ count }) => count * 2,
    },
    { count: '3' }
  );
  const custom: WebMCPPlugin = { name: 'custom', aroundInvoke: (_call, next) => next() };
  const customObserved: Promise<InvocationResult<number>> = invoke(
    {
      tool,
      input,
      plugins: [custom],
      execute: ({ count }) => count * 2,
    },
    { count: '3' }
  );
  return { approved, traced, observed, customObserved };
}
