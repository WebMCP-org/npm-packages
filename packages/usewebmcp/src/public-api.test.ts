import { expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import * as hooks from './index.js';

it('exports one registration-only hook without legacy state controls', async () => {
  expect(hooks).not.toHaveProperty('useWebMCPTool');
  const hook = await renderHook(() =>
    hooks.useWebMCP({
      name: 'public_contract',
      description: 'The single registration hook',
      enabled: false,
      execute: () => 42,
    })
  );
  expect(hook.result.current).not.toHaveProperty('state');
  expect(hook.result.current).not.toHaveProperty('reset');
  await expect(hook.result.current.execute({})).resolves.toBe(42);
});
