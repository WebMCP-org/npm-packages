import { SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { expect, it } from 'vitest';
import { withPlugins } from './index.js';
import { otel } from './otel.js';

const signal = () => new AbortController().signal;

it('records one span per call and marks failures, without inputs or messages', async () => {
  const exporter = new InMemorySpanExporter();
  const tracer = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }).getTracer('test');
  const ok = withPlugins({ name: 'ok', execute: () => 1 }, [otel({ tracer })]);
  const bad = withPlugins({ name: 'bad', execute: () => Promise.reject(new TypeError('secret')) }, [
    otel({ tracer }),
  ]);

  await expect(ok.execute({ password: 'secret' }, { signal: signal() })).resolves.toBe(1);
  await expect(bad.execute(undefined, { signal: signal() })).rejects.toThrow('secret');

  const spans = exporter.getFinishedSpans();
  expect(spans.map(({ name, attributes, status }) => ({ name, attributes, status }))).toEqual([
    {
      name: 'execute_tool ok',
      attributes: { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'ok' },
      status: { code: SpanStatusCode.UNSET },
    },
    {
      name: 'execute_tool bad',
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'bad',
        'error.type': 'TypeError',
      },
      status: { code: SpanStatusCode.ERROR },
    },
  ]);
  expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain('secret');
});

it('works without a configured OpenTelemetry SDK', async () => {
  const tool = withPlugins({ name: 'ok', execute: () => 1 }, [otel()]);
  await expect(tool.execute(undefined, { signal: signal() })).resolves.toBe(1);
});
