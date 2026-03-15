import { describe, expect, it } from 'vitest';
import { IframeSandboxExecutor } from '../iframe-executor';

describe('IframeSandboxExecutor', () => {
  it('executes simple code and returns result', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => { return 42; }', {});
    expect(result.result).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('returns undefined for void code', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => {}', {});
    expect(result.result).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('captures console.log output', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { console.log("hello", "world"); return 1; }',
      {}
    );
    expect(result.result).toBe(1);
    expect(result.logs).toContain('hello world');
  });

  it('captures console.warn output', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { console.warn("warning!"); return 1; }',
      {}
    );
    expect(result.logs).toContain('[warn] warning!');
  });

  it('captures console.error output', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => { console.error("bad"); return 1; }', {});
    expect(result.logs).toContain('[error] bad');
  });

  it('proxies tool calls to host functions', async () => {
    const executor = new IframeSandboxExecutor();
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
    expect(result.error).toBeUndefined();
  });

  it('handles multiple sequential tool calls', async () => {
    const executor = new IframeSandboxExecutor();
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
    const executor = new IframeSandboxExecutor();
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

  it('returns error for tool not found', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { try { await codemode.nonexistent(); return "no"; } catch (e) { return "caught: " + e.message; } }',
      {}
    );
    expect(result.result).toBe('caught: Tool "nonexistent" not found');
  });

  it('enforces timeout for long-running code', async () => {
    const executor = new IframeSandboxExecutor({ timeout: 500 });
    const result = await executor.execute('async () => { await new Promise(function() {}); }', {});
    expect(result.error).toBe('Execution timed out');
  });

  it('returns error for code that throws', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => { throw new Error("boom"); }', {});
    expect(result.error).toBe('boom');
    expect(result.result).toBeUndefined();
  });

  it('blocks network access via CSP', async () => {
    const executor = new IframeSandboxExecutor({ timeout: 3000 });
    const result = await executor.execute(
      'async () => { try { await fetch("https://example.com"); return "leaked"; } catch (e) { return "blocked: " + e.message; } }',
      {}
    );
    // CSP should block fetch — the exact error message varies by browser
    expect(result.result).not.toBe('leaked');
    expect(
      typeof result.result === 'string' && (result.result as string).startsWith('blocked:')
    ).toBe(true);
  });

  it('cleans up iframe after execution', async () => {
    const beforeCount = document.querySelectorAll('iframe').length;
    const executor = new IframeSandboxExecutor();
    await executor.execute('async () => { return 1; }', {});
    const afterCount = document.querySelectorAll('iframe').length;
    expect(afterCount).toBe(beforeCount);
  });

  it('handles concurrent executions without interference', async () => {
    const executor = new IframeSandboxExecutor();
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

  it('handles returning complex objects', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { return { name: "test", items: [1, 2, 3], nested: { ok: true } }; }',
      {}
    );
    expect(result.result).toEqual({ name: 'test', items: [1, 2, 3], nested: { ok: true } });
  });
});
