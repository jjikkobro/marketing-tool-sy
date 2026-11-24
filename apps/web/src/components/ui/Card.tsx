import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** 카드는 "네모" 요소라 작은 radius(rounded-square)와 얇은 선만 쓴다. 그림자는 쓰지 않는다. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-square border border-ink-200 bg-white', className)} {...props} />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-6 py-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
