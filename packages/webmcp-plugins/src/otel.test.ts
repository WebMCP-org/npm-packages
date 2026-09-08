import {
  ROOT_CONTEXT,
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import { InvocationFailure, invoke } from './invocation.js';
import { ConsentBroker, consent } from './consent.js';
import { otel } from './otel.js';

const tool = { instanceId: 'lookup-1', name: 'lookup' };

// Fake only the application-owned telemetry boundary; use the real invocation runner.
function telemetry() {
  const span = {
    setAttribute: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    end: vi.fn(),
  } satisfies Pick<Span, 'setAttribute' | 'setStatus' | 'end'>;
  const tracer = { startSpan: vi.fn(() => span as unknown as Span) };
  return { span, tracer };
}

describe('otel', () => {
  it('spans the whole local invocation without capturing private payloads or inventing MCP traffic', async () => {
    const { tracer, span } = telemetry();
    let finish!: (value: string) => void;
    const result = invoke(
      {
        tool,
        plugins: [otel({ tracer: tracer as unknown as Tracer })],
        execute: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
      { password: 'secret' }
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(tracer.startSpan).toHaveBeenCalledWith(
      'webmcp.invoke lookup',
      expect.objectContaining({
        kind: SpanKind.INTERNAL,
        attributes: { 'webmcp.tool.name': 'lookup' },
      }),
      expect.anything()
    );
    expect(span.end).not.toHaveBeenCalled();
    finish('private response');
    await expect(result).resolves.toEqual({
      value: 'private response',
      response: 'private response',
    });
    expect(span.setAttribute).toHaveBeenCalledWith('webmcp.invocation.outcome', 'success');
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tracer.startSpan.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(span.setAttribute.mock.calls)).not.toContain('private response');
  });
  it.each(['startSpan', 'setAttribute', 'end'] as const)(
    'preserves a completed effect when %s and diagnostics throw',
    async (broken) => {
      const { tracer, span } = telemetry();
      const failure = new Error('exporter failed');
      if (broken === 'startSpan')
        tracer.startSpan.mockImplementation(() => {
          throw failure;
        });
      else
        span[broken].mockImplementation(() => {
          throw failure;
        });
      const diagnostic = vi.fn(() => {
        throw new Error('diagnostic failed');
      });
      const execute = vi.fn(() => 'saved');
      await expect(
        invoke(
          {
            tool,
            execute,
            plugins: [
              otel({
                tracer: tracer as unknown as Tracer,
                onDiagnostic: diagnostic,
              }),
            ],
          },
          {}
        )
      ).resolves.toEqual({ value: 'saved', response: 'saved' });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(diagnostic).toHaveBeenCalledWith(failure);
      expect(span.end).toHaveBeenCalledTimes(broken === 'startSpan' ? 0 : 1);
    }
  );

  it.each([
    'denied',
    'cancelled',
    'invalid_input',
    'tool_error',
    'format_error',
    'middleware_error',
  ] as const)(
    'records %s without replacing it or capturing the private error message',
    async (kind) => {
      const { tracer, span } = telemetry();
      const failure = new InvocationFailure(kind, new Error('secret credential'));
      const execute = vi.fn();
      await expect(
        invoke(
          {
            tool,
            execute,
            plugins: [
              otel({ tracer: tracer as unknown as Tracer }),
              {
                name: 'test-plugin',
                aroundInvoke: async () => {
                  throw failure;
                },
              },
            ],
          },
          {}
        )
      ).rejects.toBe(failure);
      expect(execute).not.toHaveBeenCalled();
      expect(span.setAttribute).toHaveBeenCalledWith('webmcp.invocation.outcome', kind);
      expect(span.setAttribute).toHaveBeenCalledWith('error.type', kind);
      expect(span.setStatus).toHaveBeenCalledWith({
        code: kind === 'cancelled' ? SpanStatusCode.UNSET : SpanStatusCode.ERROR,
      });
      expect(JSON.stringify(span.setAttribute.mock.calls)).not.toContain('secret');
      expect(JSON.stringify(span.setStatus.mock.calls)).not.toContain('secret');
      expect(span.end).toHaveBeenCalledTimes(1);
    }
  );

  it('uses MCP metadata for remote parenting without adding it to tool arguments', async () => {
    const { tracer } = telemetry();
    const parent = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
      isRemote: true,
    });
    const propagator = {
      inject: vi.fn(),
      fields: () => ['traceparent'],
      extract: vi.fn(() => parent),
    };
    const metadata = {
      traceparent: 'remote-parent',
      tracestate: 'vendor=state',
      baggage: 'private=true',
    };
    const execute = vi.fn<(input: unknown) => string>(() => 'done');
    await invoke(
      {
        tool,
        execute,
        plugins: [otel({ tracer: tracer as unknown as Tracer, propagator })],
      },
      { query: 'abc' },
      {
        protocol: 'mcp',
        mcp: { protocolVersion: '2026-07-28', requestId: 'request-1' },
        traceContext: metadata,
      }
    );
    expect(propagator.extract).toHaveBeenCalledWith(ROOT_CONTEXT, metadata, expect.anything());
    expect(tracer.startSpan).toHaveBeenCalledWith(
      'tools/call lookup',
      expect.objectContaining({
        kind: SpanKind.SERVER,
        attributes: {
          'mcp.method.name': 'tools/call',
          'gen_ai.tool.name': 'lookup',
          'gen_ai.operation.name': 'execute_tool',
          'mcp.protocol.version': '2026-07-28',
          'jsonrpc.request.id': 'request-1',
        },
      }),
      parent
    );
    expect(execute.mock.calls[0]?.[0]).toEqual({ query: 'abc' });
    expect(JSON.stringify(tracer.startSpan.mock.calls)).not.toContain('private=true');
  });

  it('activates its span for downstream work and never repeats work if context activation fails', async () => {
    const { tracer, span } = telemetry();
    let activeSpan: Span | undefined;
    const activate = vi.spyOn(context, 'with').mockImplementation((active, callback) => {
      activeSpan = trace.getSpan(active);
      callback();
      throw new Error('context manager failed after invoking callback');
    });
    try {
      const execute = vi.fn(() => 'saved');
      await expect(
        invoke(
          {
            tool,
            execute,
            plugins: [otel({ tracer: tracer as unknown as Tracer })],
          },
          {}
        )
      ).resolves.toEqual({ value: 'saved', response: 'saved' });
      expect(activeSpan).toBe(span);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(span.end).toHaveBeenCalledTimes(1);
    } finally {
      activate.mockRestore();
    }
  });

  it('links ambient transport tracing to the remote MCP parent', async () => {
    const { tracer } = telemetry();
    const ambientSpan = {
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'aaaaaaaaaaaaaaaa',
      traceFlags: 1,
    };
    const remoteSpan = {
      traceId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      spanId: 'bbbbbbbbbbbbbbbb',
      traceFlags: 1,
      isRemote: true,
    };
    const ambient = trace.setSpanContext(ROOT_CONTEXT, ambientSpan);
    const remote = trace.setSpanContext(ROOT_CONTEXT, remoteSpan);
    const propagator = {
      inject: vi.fn(),
      fields: () => ['traceparent'],
      extract: vi.fn(() => remote),
    };
    await invoke(
      {
        tool,
        execute: () => 'done',
        plugins: [
          otel({
            tracer: tracer as unknown as Tracer,
            propagator,
            parentContext: () => ambient,
          }),
        ],
      },
      {},
      { protocol: 'mcp', traceContext: { traceparent: 'remote' } }
    );
    expect(tracer.startSpan).toHaveBeenCalledWith(
      'tools/call lookup',
      expect.objectContaining({
        links: [{ context: ambientSpan }],
      }),
      remote
    );
  });
  it('includes validation, consent wait, and response formatting in one span', async () => {
    const { tracer, span } = telemetry();
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    let validate!: (value: number) => void;
    let format!: (value: string) => void;
    const result = invoke(
      {
        tool,
        input: {
          validate: (_input: string) =>
            new Promise<number>((resolve) => {
              validate = resolve;
            }),
        },
        execute: (value) => value + 1,
        formatOutput: () =>
          new Promise<string>((resolve) => {
            format = resolve;
          }),
        plugins: [otel({ tracer: tracer as unknown as Tracer }), consent({ broker })],
      },
      '2',
      { forAgent: true }
    );
    await vi.waitFor(() => expect(validate).toBeTypeOf('function'));
    expect(span.end).not.toHaveBeenCalled();
    validate(2);
    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    expect(span.end).not.toHaveBeenCalled();
    await broker.decide(broker.getSnapshot()[0]!.id, { approved: true });
    await vi.waitFor(() => expect(format).toBeTypeOf('function'));
    expect(span.end).not.toHaveBeenCalled();
    format('three');
    await expect(result).resolves.toEqual({ value: 3, response: 'three' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });
  it('ends a cancelled approval span once and never dispatches after late approval', async () => {
    const { tracer, span } = telemetry();
    const broker = new ConsentBroker({ policy: { mode: 'click' } });
    const abort = new AbortController();
    const execute = vi.fn(() => 'must not run');
    const outcome = invoke(
      {
        tool,
        execute,
        plugins: [otel({ tracer: tracer as unknown as Tracer }), consent({ broker })],
      },
      {},
      { signal: abort.signal }
    ).catch((error: unknown) => error);
    await vi.waitFor(() => expect(broker.getSnapshot()).toHaveLength(1));
    const request = broker.getSnapshot()[0]!;
    abort.abort();
    expect(await outcome).toMatchObject({ kind: 'cancelled' });
    expect(broker.getSnapshot()).toEqual([]);
    expect(await broker.decide(request.id, { approved: true })).toBe(false);
    await vi.waitFor(() => expect(span.end).toHaveBeenCalledTimes(1));
    expect(span.setAttribute).toHaveBeenCalledWith('webmcp.invocation.outcome', 'cancelled');
    expect(execute).not.toHaveBeenCalled();
  });
});
