'use client';

import { useRef, useState, useEffect } from 'react';
import { useInView } from 'motion/react';
import { Plus, Globe, List, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IntegrationsPopover } from './integrations-popover';

export function IntegrationBlock({
  popoverPosition = 'top',
}: {
  popoverPosition?: 'top' | 'bottom';
}) {
  const blockRef = useRef<HTMLDivElement>(null);
  const blockInView = useInView(blockRef, { margin: '-50% 0px -50% 0px', once: false });
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowDialog(blockInView), blockInView ? 500 : 0);
    return () => clearTimeout(timer);
  }, [blockInView]);

  return (
    <div
      ref={blockRef}
      className="relative min-h-[400px] md:min-h-[500px] flex items-center justify-center p-6 md:p-12 overflow-visible"
    >
      <div className="w-full max-w-lg rounded-2xl h-36 px-6 py-6 flex flex-col justify-between border border-border relative bg-card">
        <p className="text-sm font-medium">Plan, search</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-muted rounded-lg transition-colors">
              <Plus className="size-5" />
            </button>
            <button className="p-2 hover:bg-muted rounded-lg transition-colors">
              <Globe className="size-5" />
            </button>
            <div className="relative">
              <IntegrationsPopover open={showDialog} position={popoverPosition} />
              <button
                className={cn(
                  'flex items-center gap-2 w-fit h-9 px-2 rounded-3xl border border-transparent transition-colors',
                  showDialog && 'bg-muted border-border'
                )}
              >
                <List className="size-3.5" />
                <span className="text-sm">Sources</span>
              </button>
            </div>
          </div>
          <Button variant="default" size="icon" className="rounded-full">
            <ChevronUp className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
