import { Suspense, createElement, useLayoutEffect } from 'react';
import { expect, it } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useCommittedRef } from './useCommittedRef.js';

it('publishes values at commit without leaking suspended renders', async () => {
  const pending = new Promise<never>(() => {});
  let valueSeenByLayoutEffect: string | undefined;
  const hook = await renderHook(
    ({ value, suspend }: { value: string; suspend?: boolean }) => {
      const ref = useCommittedRef(value);
      useLayoutEffect(() => {
        valueSeenByLayoutEffect = ref.current;
      }, [ref, value]);

      if (suspend) {
        throw pending;
      }
      return ref;
    },
    {
      initialProps: { value: 'first' },
      wrapper: ({ children }) => createElement(Suspense, { fallback: null }, children),
    }
  );

  await hook.rerender({ value: 'committed' });
  expect(valueSeenByLayoutEffect).toBe('committed');

  await hook.rerender({ value: 'uncommitted', suspend: true });
  expect(hook.result.current.current).toBe('committed');
  await hook.unmount();
});
