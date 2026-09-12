import type { Tracer } from '@opentelemetry/api';
import {
  ConsentBroker,
  consent,
  consentBroker,
  type ConsentMetadata,
  type PendingConsentRequest,
} from '../src/consent.js';
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
      plugins: [consentBroker({ broker })],
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

/**
 * PendingConsentRequest from the consent entry must be the Guard shape
 * (lastError, attemptsRemaining, toolName), not the legacy broker snapshot.
 */
export function pendingConsentRequestIsGuardShape(req: PendingConsentRequest) {
  const lastError: string | undefined = req.lastError;
  const attemptsRemaining: number | undefined = req.attemptsRemaining;
  const toolName: string = req.toolName;
  return { lastError, attemptsRemaining, toolName };
}

const consentMetadata: ConsentMetadata = {
  scope: ['read:deployments'],
  reversible: true,
  riskLevel: 'low',
  requiresApproval: true,
};

export const guardShapedPending: PendingConsentRequest = {
  id: 'id',
  toolName: 'rollback',
  origin: 'https://app.example.com',
  args: { revision: 'abc' },
  consent: consentMetadata,
  createdAt: 0,
  lastError: 'presence failed',
  attemptsRemaining: 2,
};

export type AssertTrue<T extends true> = T;
export type PendingHasToolName = AssertTrue<
  'toolName' extends keyof PendingConsentRequest ? true : false
>;
export type PendingHasLastError = AssertTrue<
  'lastError' extends keyof PendingConsentRequest ? true : false
>;
export type PendingHasAttemptsRemaining = AssertTrue<
  'attemptsRemaining' extends keyof PendingConsentRequest ? true : false
>;
export type PendingRejectsInvocationId = AssertTrue<
  'invocationId' extends keyof PendingConsentRequest ? false : true
>;
