'use client';

import { useRef } from 'react';
import { useInView } from 'motion/react';
import { siteConfig } from '@/lib/config';
import { SectionHeader } from '@/components/section-header';
import { PlanSearchCard } from '@/components/animations/sections/plan-search-card';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { HeaderBadge } from '@/components/header-badge';
import { cn } from '@/lib/utils';

const connectConfig = siteConfig.connectSection;

export function ConnectSection() {
  const planRef = useRef<HTMLDivElement>(null);
  const integrationsRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDivElement>(null);

  const mobilePlanRef = useRef<HTMLDivElement>(null);
  const mobileIntegrationsRef = useRef<HTMLDivElement>(null);
  const mobileSourcesRef = useRef<HTMLDivElement>(null);

  const planInView = useInView(planRef, { margin: '-100px', once: false });
  const integrationsInView = useInView(integrationsRef, {
    margin: '-150px 0px -60% 0px',
    once: false,
  });
  const sourcesInView = useInView(sourcesRef, { margin: '-150px 0px -60% 0px', once: false });

  const mobilePlanInView = useInView(mobilePlanRef, { margin: '-100px', once: false });
  const mobileIntegrationsInView = useInView(mobileIntegrationsRef, {
    margin: '-150px 0px -60% 0px',
    once: false,
  });
  const mobileSourcesInView = useInView(mobileSourcesRef, {
    margin: '-150px 0px -60% 0px',
    once: false,
  });

  const status = useConnectionStatus(planInView);
  const mobileStatus = useConnectionStatus(mobilePlanInView);

  const showDialog = integrationsInView && !sourcesInView;
  const showTyping = sourcesInView;

  const mobileShowDialog = mobileIntegrationsInView && !mobileSourcesInView;
  const mobileShowTyping = mobileSourcesInView;

  // On desktop, ensure connection badge shows when plan is in view
  const desktopStatus = planInView ? (status === 'idle' ? 'connecting' : status) : status;

  return (
    <section id="connect" className="w-full relative">
      <SectionHeader>
        <div className="flex flex-col items-center justify-center">
          <HeaderBadge icon={connectConfig.badge.icon} text={connectConfig.badge.text} />
          <div className="flex flex-col items-center justify-center gap-4 mt-4">
            <h2 className="text-3xl md:text-4xl lg:text-6xl font-medium tracking-tighter text-center text-balance">
              {connectConfig.title.before}
              <span
                className={cn(
                  'bg-radial from-gradient-primary to-gradient-secondary/40 bg-clip-text text-transparent'
                )}
              >
                {connectConfig.title.highlight}
              </span>
            </h2>
            <p className="text-muted-foreground text-center text-balance mx-auto">
              {connectConfig.description}
            </p>
          </div>
        </div>
      </SectionHeader>
      <div className="grid md:grid-cols-6">
        <div className="col-span-4 w-full md:sticky md:top-20 md:self-start">
          <div className="hidden md:flex flex-col gap-10 p-8 md:p-14 relative">
            <PlanSearchCard
              rootRef={null}
              status={desktopStatus}
              showDialog={showDialog}
              showTyping={showTyping}
              popoverPosition="bottom"
            />
          </div>
          <div className="md:hidden flex flex-col gap-20 p-8 relative">
            <div ref={mobilePlanRef} className="flex flex-col gap-6">
              <PlanSearchCard
                rootRef={null}
                status={mobilePlanInView ? mobileStatus : 'idle'}
                showDialog={false}
                showTyping={false}
                popoverPosition="bottom"
              />
              <div className="flex flex-col gap-4">
                <h3 className="text-3xl font-medium tracking-tighter text-left">
                  {connectConfig.step1.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance">
                  {connectConfig.step1.description}
                </p>
              </div>
            </div>

            <div ref={mobileIntegrationsRef} className="flex flex-col gap-6">
              <PlanSearchCard
                rootRef={null}
                status="idle"
                showDialog={mobileShowDialog}
                showTyping={false}
                popoverPosition="top"
              />
              <div className="flex flex-col gap-4">
                <h3 className="text-3xl font-medium tracking-tighter text-left">
                  {connectConfig.step2.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance">
                  {connectConfig.step2.description}
                </p>
              </div>
            </div>

            <div ref={mobileSourcesRef} className="flex flex-col gap-6">
              <PlanSearchCard
                rootRef={null}
                status="idle"
                showDialog={false}
                showTyping={mobileShowTyping}
                popoverPosition="bottom"
              />
              <div className="flex flex-col gap-4">
                <h3 className="text-3xl font-medium tracking-tighter text-left">
                  {connectConfig.step3.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance">
                  {connectConfig.step3.description}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden md:block col-span-2 w-full border-l border-border">
          <div className="flex flex-col gap-4 p-8 md:p-14">
            <div className="flex flex-col gap-10">
              <div ref={planRef} className="h-[50vh]">
                <h3 className="text-3xl md:text-4xl font-medium tracking-tighter text-left">
                  {connectConfig.step1.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance mt-4">
                  {connectConfig.step1.description}
                </p>
              </div>

              <div ref={integrationsRef} className="h-[50vh]">
                <h3 className="text-3xl md:text-4xl font-medium tracking-tighter text-left">
                  {connectConfig.step2.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance mt-4">
                  {connectConfig.step2.description}
                </p>
              </div>

              <div ref={sourcesRef} className="h-[50vh]">
                <h3 className="text-3xl md:text-4xl font-medium tracking-tighter text-left">
                  {connectConfig.step3.title}
                </h3>
                <p className="text-muted-foreground text-left text-balance mt-4">
                  {connectConfig.step3.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
