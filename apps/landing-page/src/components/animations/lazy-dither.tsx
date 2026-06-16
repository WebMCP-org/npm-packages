'use client';

import { useEffect, useRef, useState } from 'react';

import { Dither } from '@/components/animations/dither';
import { cn } from '@/lib/utils';
import type { DitherProps } from '@/components/animations/dither';

export type LazyDitherProps = DitherProps & {
  className?: string;
  placeholderClassName?: string;
  rootMargin?: string;
};

export function LazyDither({
  className,
  placeholderClassName,
  rootMargin = '200px',
  ...props
}: LazyDitherProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (shouldMount) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setShouldMount(true);
        io.disconnect();
      },
      { root: null, rootMargin, threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, shouldMount]);

  useEffect(() => {
    if (!shouldMount) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [shouldMount]);

  return (
    <div ref={containerRef} className={cn('relative h-full w-full', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-linear-to-r from-muted/10 via-muted/25 to-muted/10',
          placeholderClassName
        )}
      />

      {shouldMount ? (
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            visible ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Dither {...props} />
        </div>
      ) : null}
    </div>
  );
}
