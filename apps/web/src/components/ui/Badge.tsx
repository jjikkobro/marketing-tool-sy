import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'positive' | 'neutral' | 'caution' | 'critical' | 'brand' | 'muted';

/* 배지는 "동그라미" 요소다. 의미 색상은 CI 보조색(Burgundy, Tangerine, Sand)에서 가져온다. */
const toneClass: Record<BadgeTone, string> = {
  positive: 'bg-positive-50 text-positive',
  neutral: 'bg-ink-100 text-charcoal',
  caution: 'bg-tangerine-50 text-tangerine-800',
  critical: 'bg-burgundy-50 text-burgundy',
  brand: 'bg-brand-50 text-brand-700',
  muted: 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
