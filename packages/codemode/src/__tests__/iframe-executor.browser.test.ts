import { describe, expect, it } from 'vitest';
import { IframeSandboxExecutor } from '../iframe-executor';

function hostedRuntimeUrl(parentOrigin: string, delayMs = 0): string {
  const url = new URL('/src/__tests__/fixtures/iframe-runtime-hosted.html', window.location.origin);
  url.searchParams.set('parentOrigin', parentOrigin);
  url.searchParams.set('delayMs', String(delayMs));
  return url.toString();
}

describe('IframeSandboxExecutor', () => {
  it('executes simple code and returns result with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => { return 42; }', {});
    expect(result.result).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('returns undefined for void code with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => {}', {});
    expect(result.result).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('captures console output with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { console.log("hello", "world"); console.warn("warning!"); console.error("bad"); return 1; }',
      {}
    );
    expect(result.result).toBe(1);
    expect(result.logs).toContain('hello world');
    expect(result.logs).toContain('[warn] warning!');
    expect(result.logs).toContain('[error] bad');
  });

  it('proxies tool calls to host functions with a provisioned iframe', async () => {
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

  it('handles multiple sequential tool calls with a provisioned iframe', async () => {
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

  it('propagates tool call errors with a provisioned iframe', async () => {
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

  it('returns error for tool not found with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute(
      'async () => { try { await codemode.nonexistent(); return "no"; } catch (e) { return "caught: " + e.message; } }',
      {}
    );
    expect(result.result).toBe('caught: Tool "nonexistent" not found');
  });

  it('enforces timeout for long-running code with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor({ timeout: 500 });
    const result = await executor.execute('async () => { await new Promise(function() {}); }', {});
    expect(result.error).toBe('Execution timed out');
  });

  it('returns error for code that throws with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor();
    const result = await executor.execute('async () => { throw new Error("boom"); }', {});
    expect(result.error).toBe('boom');
    expect(result.result).toBeUndefined();
  });

  it('blocks network access via CSP with a provisioned iframe', async () => {
    const executor = new IframeSandboxExecutor({ timeout: 3000 });
    const result = await executor.execute(
      'async () => { try { await fetch("https://example.com"); return "leaked"; } catch (e) { return "blocked: " + e.message; } }',
      {}
    );
    expect(result.result).not.toBe('leaked');
    expect(
      typeof result.result === 'string' && (result.result as string).startsWith('blocked:')
    ).toBe(true);
  });

  it('allows overriding the CSP for a provisioned iframe', async () => {
    const customCsp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:";
    const executor = new IframeSandboxExecutor({ timeout: 50, csp: customCsp });

    const execution = executor.execute('async () => { await new Promise(function() {}); }', {});
    const iframe = document.querySelector('iframe');

    expect(iframe).not.toBeNull();
    expect(iframe?.srcdoc).toContain(customCsp);

    await execution;
  });

  it('applies provisioned iframe defaults', async () => {
    const executor = new IframeSandboxExecutor({ timeout: 50 });

    const execution = executor.execute('async () => { await new Promise(function() {}); }', {});
    const iframe = document.querySelector('iframe');

    expect(iframe?.sandbox.contains('allow-scripts')).toBe(true);
    expect(iframe?.style.display).toBe('none');
    expect(iframe?.srcdoc).toContain('Content-Security-Policy');

    await execution;
  });

  it('cleans up the provisioned iframe after execution', async () => {
    const beforeCount = document.querySelectorAll('iframe').length;
    const executor = new IframeSandboxExecutor();
    await executor.execute('async () => { return 1; }', {});
    const afterCount = document.querySelectorAll('iframe').length;
    expect(afterCount).toBe(beforeCount);
  });

  it('handles concurrent provisioned iframe executions without interference', async () => {
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

  it('waits for sandbox readiness with a provided iframe', async () => {
    const executor = new IframeSandboxExecutor({
      timeout: 1000,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin, 100);
        return iframe;
      },
    });

    const result = await executor.execute('async () => { return 42; }', {});
    expect(result.result).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('uses a fresh iframe for each user-provided execution', async () => {
    const created: HTMLIFrameElement[] = [];
    const executor = new IframeSandboxExecutor({
      timeout: 1000,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin);
        created.push(iframe);
        return iframe;
      },
    });

    await executor.execute('async () => { return 1; }', {});
    await executor.execute('async () => { return 2; }', {});

    expect(created).toHaveLength(2);
    expect(created[0]!).not.toBe(created[1]!);
    expect(created[0]!.isConnected).toBe(false);
    expect(created[1]!.isConnected).toBe(false);
  });

  it('executes against a caller-hosted runtime with a provided iframe', async () => {
    const executor = new IframeSandboxExecutor({
      timeout: 1000,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin);
        return iframe;
      },
    });

    const result = await executor.execute(
      'async () => { return await codemode.getWeather({ location: "Paris" }); }',
      {
        getWeather: async (args: unknown) => {
          const { location } = args as { location: string };
          return `Sunny in ${location}`;
        },
      }
    );

    expect(result.result).toBe('Sunny in Paris');
  });

  it('propagates tool call errors with a provided iframe', async () => {
    const executor = new IframeSandboxExecutor({
      timeout: 1000,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin);
        return iframe;
      },
    });

    const result = await executor.execute(
      'async () => { try { await codemode.failTool(); return "no"; } catch (e) { return "caught: " + e.message; } }',
      {
        failTool: async () => {
          throw new Error('Tool failed');
        },
      }
    );

    expect(result.result).toBe('caught: Tool failed');
  });

  it('times out if the provided iframe never becomes ready', async () => {
    const executor = new IframeSandboxExecutor({
      timeout: 100,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.srcdoc = '<!DOCTYPE html><html><body>no runtime</body></html>';
        return iframe;
      },
    });

    const beforeCount = document.querySelectorAll('iframe').length;
    const result = await executor.execute('async () => { return 1; }', {});

    expect(result.error).toBe('Execution timed out');
    expect(document.querySelectorAll('iframe').length).toBe(beforeCount);
  });

  it('times out if a provided iframe execution never completes after ready', async () => {
    const beforeCount = document.querySelectorAll('iframe').length;
    const executor = new IframeSandboxExecutor({
      timeout: 100,
      targetOrigin: window.location.origin,
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin);
        return iframe;
      },
    });

    const result = await executor.execute('async () => { await new Promise(function() {}); }', {});

    expect(result.error).toBe('Execution timed out');
    expect(document.querySelectorAll('iframe').length).toBe(beforeCount);
  });

  it('uses targetOrigin for parent-to-child provided iframe messages', async () => {
    const executor = new IframeSandboxExecutor({
      timeout: 100,
      targetOrigin: 'https://example.com',
      iframeFactory: () => {
        const iframe = document.createElement('iframe');
        iframe.src = hostedRuntimeUrl(window.location.origin);
        return iframe;
      },
    });

    const result = await executor.execute('async () => { return 1; }', {});
    expect(result.error).toBe('Execution timed out');
  });

  it('rejects connected iframes from the user factory', async () => {
    const connectedIframe = document.createElement('iframe');
    document.body.appendChild(connectedIframe);

    try {
      const executor = new IframeSandboxExecutor({
        timeout: 100,
        targetOrigin: window.location.origin,
        iframeFactory: () => connectedIframe,
      });

      const result = await executor.execute('async () => { return 1; }', {});
      expect(result.error).toBe('iframeFactory must return a detached iframe element');
    } finally {
      connectedIframe.remove();
    }
  });
});
