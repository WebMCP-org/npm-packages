import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type HeaderBadgeProps = {
  icon: ReactNode;
  text: string;
  className?: string;
};

export function HeaderBadge({ icon, text, className }: HeaderBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-border/70 bg-card/90 px-4 py-1.5 shadow-[var(--shadow-md)] backdrop-blur',
        className
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-primary">{icon}</span>
      <span className="truncate text-sm font-medium text-foreground">{text}</span>
    </div>
  );
}
