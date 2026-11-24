import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** 영문 섹션 라벨. Poppins로 표시한다. */
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-display text-xs font-semibold tracking-[0.16em] text-brand-700 uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
