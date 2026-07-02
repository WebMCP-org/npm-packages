'use client';

import { Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected';

export function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  return (
    <AnimatePresence mode="wait">
      {(status === 'connecting' || status === 'connected') && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center justify-center z-10"
        >
          <Button
            size="sm"
            className={cn(
              'flex items-center gap-2 rounded-full pl-2 pr-3 py-2 text-sm font-medium text-white w-fit',
              'bg-[#005f8f] hover:bg-[#004d73] transition-colors'
            )}
          >
            <div className="size-4 flex items-center justify-center shrink-0">
              {status === 'connecting' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <div className="size-4 bg-background rounded-full flex items-center justify-center">
                  <Check className="size-3 text-primary stroke-2" />
                </div>
              )}
            </div>
            <span className="text-sm font-semibold whitespace-nowrap">
              {status === 'connecting' ? 'Connecting' : 'Connected'}
            </span>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
