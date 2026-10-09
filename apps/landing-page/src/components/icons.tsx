import { cn } from '@/lib/utils';

export const Icons = {
  code: ({ className }: { className?: string }) => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
    >
      <path
        d="M5.83333 6.66667L2.5 10L5.83333 13.3333M14.1667 6.66667L17.5 10L14.1667 13.3333M11.6667 3.33333L8.33333 16.6667"
        stroke="#6A7282"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};
