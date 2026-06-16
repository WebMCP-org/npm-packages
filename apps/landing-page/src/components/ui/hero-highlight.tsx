'use client';
import { cn } from '@/lib/utils';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import type { MouseEvent, ReactNode } from 'react';

export const HeroHighlight = ({
  children,
  className,
  containerClassName,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const maskImage = useMotionTemplate`
    radial-gradient(
      220px circle at ${mouseX}px ${mouseY}px,
      black 0%,
      transparent 100%
    )
  `;

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLDivElement>) {
    if (!currentTarget) return;
    const { left, top } = currentTarget.getBoundingClientRect();

    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }
  return (
    <div
      className={cn(
        'group relative isolate w-full overflow-hidden bg-background',
        containerClassName
      )}
      onMouseMove={handleMouseMove}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--hero-grid-dot) 1.25px, transparent 0)',
          backgroundPosition: '12px 12px',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background:
            'radial-gradient(circle at top, var(--color-accent-glow-strong), transparent 72%)',
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--hero-grid-dot-active) 1.5px, transparent 0)',
          backgroundPosition: '12px 12px',
          backgroundSize: '24px 24px',
          WebkitMaskImage: maskImage,
          maskImage,
        }}
      />

      <div className={cn('relative z-20', className)}>{children}</div>
    </div>
  );
};

export const Highlight = ({ children, className }: { children: ReactNode; className?: string }) => {
  return (
    <motion.span
      initial={{
        backgroundSize: '0% 100%',
      }}
      animate={{
        backgroundSize: '100% 100%',
      }}
      transition={{
        duration: 2,
        ease: 'linear',
        delay: 0.5,
      }}
      style={{
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'left center',
        backgroundImage:
          'linear-gradient(90deg, var(--hero-highlight-start), var(--hero-highlight-end))',
        display: 'inline',
      }}
      className={cn('relative inline-block rounded-lg px-1.5 pb-1 text-foreground', className)}
    >
      {children}
    </motion.span>
  );
};
