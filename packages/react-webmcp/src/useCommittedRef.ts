import { useEffect, useLayoutEffect, useRef } from 'react';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useCommittedRef<T>(value: T) {
  const ref = useRef(value);

  // External MCP work may read values after commit but before passive effects. SSR cannot.
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
