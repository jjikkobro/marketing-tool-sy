import type { CollectionError, CollectionRun } from '@studio/collector/schema';
import { ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { errorKindLabel, statusMeta } from '../../lib/labels';

interface RunTableProps {
  runs: CollectionRun[];
  errors: CollectionError[];
}

const COUNTERS = [
  { key: 'pagesFetched', label: '페이지' },
  { key: 'inserted', label: '신규' },
  { key: 'updated', label: '갱신' },
  { key: 'duplicates', label: '중복' },
  { key: 'rejected', label: '제외' },
  { key: 'retries', label: '재시도' },
] as const;

export function RunTable({ runs, errors }: RunTableProps) {
  const errorsByRun = useMemo(() => {
    const map = new Map<number, CollectionError[]>();
    for (const error of [...errors].sort((a, b) => a.id - b.id)) {
      map.set(error.runId, [...(map.get(error.runId) ?? []), error]);
    }
    return map;
  }, [errors]);

  // 문제가 있었던 실행은 처음부터 펼쳐 둔다. 운영자가 가장 먼저 봐야 하는 곳이기 때문이다.
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () =>
      new Set(
        runs
          .filter((run) => run.status === 'partial' || run.status === 'failed')
          .map((run) => run.id),
      ),
  );

  function toggle(id: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader
        title="실행 기록"
        description="행을 펼치면 그 실행의 재시도·경고·실패가 시간 순서대로 보입니다."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-600">
              <th className="w-10 py-3 pl-4" />
              <th className="px-3 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">어댑터 · 쿼리</th>
              <th className="px-3 py-3 font-medium">상태</th>
              {COUNTERS.map((counter) => (
                <th key={counter.key} className="px-3 py-3 text-right font-medium">
                  {counter.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const runErrors = errorsByRun.get(run.id) ?? [];
              const expanded = open.has(run.id);
              const panelId = `run-${run.id}-errors`;
              return (
                <Fragment key={run.id}>
                  <tr className="border-t border-ink-100 hover:bg-ink-50">
                    <td className="py-3 pl-4">
                      {runErrors.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(run.id)}
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          aria-label={`실행 #${run.id} 오류 ${runErrors.length}건 ${expanded ? '접기' : '펼치기'}`}
                          className="flex size-6 items-center justify-center rounded-full hover:bg-ink-100"
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn('size-4 transition-transform', expanded && 'rotate-90')}
                          />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 font-display text-ink-600 tabular-nums">{run.id}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{run.adapterId}</div>
                      <div className="text-xs text-ink-600">
                        {run.query.kind}: {run.query.value}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={statusMeta[run.status].tone}>
                        {statusMeta[run.status].label}
                      </Badge>
                    </td>
                    {COUNTERS.map((counter) => (
                      <td
                        key={counter.key}
                        className={cn(
                          'px-3 py-3 text-right tabular-nums',
                          run[counter.key] === 0 && 'text-ink-400',
                        )}
                      >
                        {run[counter.key]}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr id={panelId} className="bg-sand-50">
                      <td />
                      <td colSpan={3 + COUNTERS.length} className="px-3 pt-1 pb-4">
                        <ol className="space-y-1.5 border-l-2 border-sand pl-4">
                          {runErrors.map((error) => (
                            <li key={error.id} className="text-xs">
                              <span className="mr-2 inline-flex gap-1 align-middle">
                                <Badge tone={error.severity === 'error' ? 'critical' : 'caution'}>
                                  {error.severity === 'error' ? '오류' : '경고'}
                                </Badge>
                                <Badge tone="muted">
                                  {errorKindLabel[error.kind]}
                                  {error.httpStatus !== null && ` · ${error.httpStatus}`}
                                </Badge>
                              </span>
                              {error.message}
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
