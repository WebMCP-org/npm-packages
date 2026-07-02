import type { ReactNode } from 'react';

interface SectionHeaderProps {
  children: ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div className="border-b w-full h-full p-6 md:p-24">
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center gap-2">
        {children}
      </div>
    </div>
  );
}
