import type { CollectionError, CollectionRun } from '@studio/collector/schema';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { statusMeta } from '../../lib/labels';

/**
 * 수집 화면 상단 요약. 데이터를 보기 전에 "이 데이터가 온전히 수집된 것인가"부터 보여준다.
 * 부분 실패나 경고가 있으면 운영 모니터로 바로 이동할 수 있게 한다.
 */
export function RunSummaryStrip({
  runs,
  errors,
}: {
  runs: CollectionRun[];
  errors: CollectionError[];
}) {
  const count = (status: CollectionRun['status']) =>
    runs.filter((run) => run.status === status).length;
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.length - errorCount;
  const needsAttention = count('partial') + count('failed') > 0;

  const items = [
    { label: '수집 실행', value: runs.length },
    { label: statusMeta.succeeded.label, value: count('succeeded') },
    { label: statusMeta.partial.label, value: count('partial'), alert: count('partial') > 0 },
    { label: statusMeta.failed.label, value: count('failed'), alert: count('failed') > 0 },
    { label: '오류', value: errorCount, alert: errorCount > 0 },
    { label: '경고', value: warningCount },
  ];

  return (
    <section
      aria-label="수집 상태 요약"
      className="flex flex-wrap items-center justify-between gap-4 rounded-square border border-ink-200 bg-white px-6 py-4"
    >
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <dt className="text-xs text-ink-600">{item.label}</dt>
            <dd
              className={`font-display text-lg font-semibold tabular-nums ${item.alert ? 'text-brand-700' : ''}`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {needsAttention && (
        <Link
          to="/operations"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          실패 원인 보기
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </section>
  );
}
