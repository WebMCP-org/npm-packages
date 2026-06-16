'use client';

import { useRef, useState, useEffect } from 'react';
import { useInView, motion, AnimatePresence } from 'motion/react';
import { Icons } from '@/components/icons';

type WorkflowStep = {
  id: string;
  agent: string;
  tokens: string;
  status: string;
  step: string;
};

const workflowSteps: WorkflowStep[] = [
  {
    id: '1',
    agent: 'logic-architect@workspace',
    tokens: '10k tokens',
    status: 'Analyzing problem statement...',
    step: 'Step 1 of 3',
  },
  {
    id: '2',
    agent: 'design-innovator@workspace',
    tokens: '20k tokens',
    status: 'Creating wireframes...',
    step: 'Step 2 of 3',
  },
  {
    id: '3',
    agent: 'user-researcher@workspace',
    tokens: '15k tokens',
    status: 'Conducting user interviews...',
    step: 'Step 3 of 3',
  },
];

const STEP_DELAYS = [200, 1000, 1800];

export function AgentWorkflowBlock() {
  const blockRef = useRef<HTMLDivElement>(null);
  const blockInView = useInView(blockRef, { amount: 0.8, margin: '20px 0px -10px 0px' });
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    if (!blockInView) {
      const resetTimer = setTimeout(() => setVisibleSteps(0), 0);
      return () => clearTimeout(resetTimer);
    }

    const timers = STEP_DELAYS.map((delay, index) =>
      setTimeout(() => setVisibleSteps(index + 1), delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [blockInView]);

  return (
    <div
      ref={blockRef}
      className="relative min-h-[400px] md:min-h-[500px] flex p-6 md:p-12 overflow-visible"
    >
      <div className="w-full max-w-lg mx-auto relative">
        <AnimatePresence>
          {visibleSteps >= 1 && (
            <StepCard
              step={workflowSteps[0]}
              className="relative z-10 w-fit -ml-2"
              showConnector={visibleSteps >= 2}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {visibleSteps >= 2 && (
            <StepCard
              step={workflowSteps[1]}
              className="relative z-10 mt-12 ml-auto w-fit -mr-4"
              showConnector={visibleSteps >= 3}
              connectorClassName="absolute -left-20 top-8"
              flip
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {visibleSteps >= 3 && (
            <StepCard step={workflowSteps[2]} className="relative z-10 mt-12 max-w-xl -ml-4" />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepCard({
  step,
  className,
  showConnector = false,
  connectorClassName = 'absolute -right-20 top-8',
  flip = false,
}: {
  step: WorkflowStep;
  className?: string;
  showConnector?: boolean;
  connectorClassName?: string;
  flip?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className={className}
    >
      {showConnector && <ConnectorSVG className={connectorClassName} flip={flip} />}
      <WorkflowCard step={step} />
    </motion.div>
  );
}

function ConnectorSVG({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`pointer-events-none w-24 h-fit ${className}`}
      viewBox="0 0 96 101"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        d="M16 7.99999L64 8C72.8366 8 80 15.1634 80 24L80 82"
        stroke="#00A6F4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <motion.path
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M88.7046 80.293C89.0951 80.6835 89.0951 81.3165 88.7046 81.707L81.4116 89C80.6306 89.7808 79.3645 89.7809 78.5835 89L71.2905 81.707C70.9001 81.3166 70.9002 80.6835 71.2905 80.293C71.681 79.9025 72.3141 79.9025 72.7046 80.293L78.9741 86.5625L78.9741 81.9609C78.9741 81.4087 79.4218 80.9609 79.9741 80.9609C80.5264 80.9609 80.9741 81.4087 80.9741 81.9609L80.9741 86.6094L87.2905 80.293C87.681 79.9025 88.3141 79.9025 88.7046 80.293Z"
        fill="#00A6F4"
      />
      <motion.path
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 2C12.6863 2 10 4.68629 10 8C10 11.3137 12.6863 14 16 14C19.3137 14 22 11.3137 22 8C22 4.68629 19.3137 2 16 2Z"
        fill="white"
        stroke="#00A6F4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformOrigin: '16px 8px' }}
      />
    </motion.svg>
  );
}

function WorkflowCard({ step }: { step: WorkflowStep }) {
  return (
    <div className="bg-card w-fit rounded-xl shadow-badge">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-1 min-w-0 flex flex-col divide-y divide-border">
            <div className="flex gap-3 items-center p-2">
              <Icons.codeIcon className="inline-block" />
              <h4 className="text-sm font-medium text-foreground">{step.agent}</h4>
              <span className="hidden md:block text-xs text-foreground whitespace-nowrap">
                {step.tokens}
              </span>
            </div>
            <div className="flex items-center justify-between w-full p-2">
              <p className="text-sm text-muted-foreground">{step.status}</p>
              <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap mt-1">
                {step.step}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
