import { describe, expect, it } from 'vitest';
import { WorkerSandboxExecutor } from '../worker-executor';

describe('WorkerSandboxExecutor', () => {
  it('executes simple code and returns result', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => { return 42; }', {});
    expect(result.result).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('returns undefined for void code', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => {}', {});
    expect(result.result).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('captures console.log output', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute(
      'async () => { console.log("hello", "world"); return 1; }',
      {}
    );
    expect(result.result).toBe(1);
    expect(result.logs).toContain('hello world');
  });

  it('proxies tool calls to host functions', async () => {
    const executor = new WorkerSandboxExecutor();
    const fns = {
      getWeather: async (args: unknown) => {
        const { location } = args as { location: string };
        return `Sunny in ${location}`;
      },
    };
    const result = await executor.execute(
      'async () => { return await codemode.getWeather({ location: "London" }); }',
      fns
    );
    expect(result.result).toBe('Sunny in London');
  });

  it('handles multiple sequential tool calls', async () => {
    const executor = new WorkerSandboxExecutor();
    const fns = {
      add: async (args: unknown) => {
        const { a, b } = args as { a: number; b: number };
        return a + b;
      },
    };
    const result = await executor.execute(
      'async () => { var x = await codemode.add({ a: 1, b: 2 }); var y = await codemode.add({ a: x, b: 10 }); return y; }',
      fns
    );
    expect(result.result).toBe(13);
  });

  it('propagates tool call errors to sandbox code', async () => {
    const executor = new WorkerSandboxExecutor();
    const fns = {
      failTool: async () => {
        throw new Error('Tool failed');
      },
    };
    const result = await executor.execute(
      'async () => { try { await codemode.failTool(); return "should not reach"; } catch (e) { return "caught: " + e.message; } }',
      fns
    );
    expect(result.result).toBe('caught: Tool failed');
  });

  it('enforces timeout for long-running code', async () => {
    const executor = new WorkerSandboxExecutor({ timeout: 500 });
    const result = await executor.execute('async () => { await new Promise(function() {}); }', {});
    expect(result.error).toBe('Execution timed out');
  });

  it('returns error for code that throws', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => { throw new Error("boom"); }', {});
    expect(result.error).toBe('boom');
  });

  it('scrubs fetch from sandbox globals', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => { return typeof fetch; }', {});
    expect(result.result).toBe('undefined');
  });

  it('scrubs XMLHttpRequest from sandbox globals', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => { return typeof XMLHttpRequest; }', {});
    expect(result.result).toBe('undefined');
  });

  it('scrubs WebSocket from sandbox globals', async () => {
    const executor = new WorkerSandboxExecutor();
    const result = await executor.execute('async () => { return typeof WebSocket; }', {});
    expect(result.result).toBe('undefined');
  });

  it('handles concurrent executions without interference', async () => {
    const executor = new WorkerSandboxExecutor();
    const fns = {
      identity: async (args: unknown) => args,
    };
    const [r1, r2, r3] = await Promise.all([
      executor.execute('async () => { return await codemode.identity({ v: 1 }); }', fns),
      executor.execute('async () => { return await codemode.identity({ v: 2 }); }', fns),
      executor.execute('async () => { return await codemode.identity({ v: 3 }); }', fns),
    ]);
    expect(r1.result).toEqual({ v: 1 });
    expect(r2.result).toEqual({ v: 2 });
    expect(r3.result).toEqual({ v: 3 });
  });
});
