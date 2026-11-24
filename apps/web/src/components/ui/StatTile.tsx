import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** 사람이 바로 확인해야 하는 지표면 오렌지 표식으로 시선을 모은다. */
  emphasis?: boolean;
}

export function StatTile({ label, value, hint, emphasis = false }: StatTileProps) {
  return (
    <div className="rounded-square border border-ink-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-sm text-ink-600">
        {emphasis && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
        {label}
      </div>
      <div
        className={cn(
          'mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums',
          emphasis && 'text-brand-700',
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
    </div>
  );
}
