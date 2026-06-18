'use client';

import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons } from '@/components/icons';

const integrations = [
  { name: 'Figma', icon: Icons.figma, installed: true, visible: true },
  { name: 'Shadcn UI', icon: Icons.shadcn, installed: false, visible: true },
  { name: 'Next.js', icon: Icons.nextjs, installed: true, visible: true },
  { name: 'Tailwind CSS', icon: Icons.tailwind, installed: true, visible: true },
];

export function IntegrationsPopover({
  open,
  position = 'bottom',
}: {
  open: boolean;
  position?: 'top' | 'bottom';
}) {
  const positionClasses = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: position === 'top' ? 10 : -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === 'top' ? 10 : -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`absolute ${positionClasses} left-1/2 -translate-x-1/2 md:left-4 md:translate-x-0 overflow-hidden rounded-3xl w-[280px] md:w-[350px] bg-linear-to-b from-[#E5E7EB] dark:from-[#27272A] to-[#E5E7EB]/40 dark:to-[#27272A]/40 text-secondary-foreground text-sm font-medium backdrop-blur-xl backdrop-saturate-150 shadow-badge z-50`}
        >
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search for servers"
                className="w-full pl-10 pr-4 py-2.5 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground pointer-events-none h-14"
              />
            </div>
            {integrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <div
                  key={integration.name}
                  className={`flex items-center gap-3 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer last:border-b-0 ${!integration.visible ? 'hidden md:flex' : ''}`}
                >
                  <div className="size-8 flex items-center justify-center shrink-0">
                    <Icon className="size-6" />
                  </div>
                  <span className="text-sm font-medium text-foreground flex-1">
                    {integration.name}
                  </span>
                  {integration.installed && (
                    <span className="text-xs text-primary font-medium bg-primary/10 rounded-lg px-2 py-1">
                      Installed
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
