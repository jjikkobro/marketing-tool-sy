import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router';
import { snapshotQuery } from '../../api/snapshot';
import { workflowSteps } from '../../app/navigation';
import { cn } from '../../lib/cn';
import { workCounts } from './counts';

/** 세 단계가 한 흐름이라는 것을 화면마다 보여준다. 단계마다 사람이 처리할 건수를 붙인다. */
export function WorkflowSteps() {
  const snapshot = useQuery(snapshotQuery());
  const counts = snapshot.data ? workCounts(snapshot.data.snapshot) : null;
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="워크플로 단계">
      {workflowSteps.map((step, index) => (
        <li key={step.path} className="flex items-center gap-2">
          {index > 0 && <ChevronRight aria-hidden className="size-4 text-ink-400" />}
          <NavLink
            to={step.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-charcoal bg-charcoal font-semibold text-white'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-charcoal hover:text-charcoal',
              )
            }
          >
            <span className="font-display text-xs">{step.step}</span>
            {step.label}
            {counts && step.countKey && counts[step.countKey] > 0 && (
              <span className="rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                {counts[step.countKey]}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ol>
  );
}
