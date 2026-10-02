import { describe, expect, it } from 'vitest';
import { withPlugins, type WebMCPPlugin } from './index.js';

const signal = () => new AbortController().signal;

describe('withPlugins', () => {
  it('runs plugins outermost first around execute and returns its result', async () => {
    const order: string[] = [];
    const trace = (name: string): WebMCPPlugin => ({
      name,
      async aroundExecute(call, next) {
        order.push(`${name}:${call.name}:${JSON.stringify(call.input)}`);
        const result = await next();
        order.push(`${name}:done`);
        return result;
      },
    });
    const tool = withPlugins(
      {
        name: 'add',
        description: 'Adds',
        execute: ({ a, b }: { a: number; b: number }) => {
          order.push('execute');
          return a + b;
        },
      },
      [trace('outer'), trace('inner')]
    );

    expect(tool.description).toBe('Adds');
    await expect(tool.execute({ a: 1, b: 2 }, { signal: signal() })).resolves.toBe(3);
    expect(order).toEqual([
      'outer:add:{"a":1,"b":2}',
      'inner:add:{"a":1,"b":2}',
      'execute',
      'inner:done',
      'outer:done',
    ]);
  });

  it('lets a plugin fail the call without running the tool', async () => {
    let ran = false;
    const tool = withPlugins({ name: 'save', execute: () => (ran = true) }, [
      { name: 'deny', aroundExecute: () => Promise.reject(new Error('denied')) },
    ]);

    await expect(tool.execute(undefined, { signal: signal() })).rejects.toThrow('denied');
    expect(ran).toBe(false);
  });

  it('rejects a second next() call', async () => {
    let runs = 0;
    const tool = withPlugins({ name: 'save', execute: () => ++runs }, [
      {
        name: 'retry',
        async aroundExecute(_call, next) {
          await next();
          return next();
        },
      },
    ]);

    await expect(tool.execute(undefined, { signal: signal() })).rejects.toThrow(
      'Plugin "retry" called next() twice'
    );
    expect(runs).toBe(1);
  });

  it('does not run the tool after the call is cancelled', async () => {
    const controller = new AbortController();
    let ran = false;
    const tool = withPlugins({ name: 'save', execute: () => (ran = true) }, [
      {
        name: 'cancel',
        aroundExecute(_call, next) {
          controller.abort(new Error('stop'));
          return next();
        },
      },
    ]);

    await expect(tool.execute(undefined, { signal: controller.signal })).rejects.toThrow('stop');
    expect(ran).toBe(false);
  });

  it('passes the caller signal to plugins and the tool', async () => {
    const controller = new AbortController();
    const seen: AbortSignal[] = [];
    const tool = withPlugins(
      { name: 'read', execute: (_input: undefined, options) => seen.push(options.signal) },
      [{ name: 'spy', aroundExecute: (call, next) => (seen.push(call.signal), next()) }]
    );

    await tool.execute(undefined, { signal: controller.signal });
    expect(seen).toEqual([controller.signal, controller.signal]);
  });
});
