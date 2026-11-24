import { errorKindSchema, type AdapterHealth } from '@studio/collector/schema';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { formatKst } from '../../lib/format';
import { errorKindLabel, platformLabel, sourceLabel, statusMeta } from '../../lib/labels';

export function AdapterHealthCard({ health }: { health: AdapterHealth }) {
  const segments = [
    { key: 'succeeded', value: health.succeeded, className: 'bg-positive' },
    { key: 'partial', value: health.partial, className: 'bg-tangerine' },
    { key: 'failed', value: health.failed, className: 'bg-burgundy' },
  ] as const;
  const errorKinds = errorKindSchema.options.filter((kind) => (health.errorsByKind[kind] ?? 0) > 0);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold">{health.adapterId}</p>
          <p className="mt-0.5 text-xs text-ink-600">
            {platformLabel[health.platform]} · {sourceLabel[health.source]}
          </p>
        </div>
        {health.lastStatus && (
          <Badge tone={statusMeta[health.lastStatus].tone}>
            마지막 {statusMeta[health.lastStatus].label}
          </Badge>
        )}
      </div>

      <div className="mt-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
          {segments.map((segment) => (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${(segment.value / Math.max(1, health.runs)) * 100}%` }}
            />
          ))}
        </div>
        <dl className="mt-2 flex gap-4 text-xs text-ink-600">
          <div>
            실행 <dd className="inline font-semibold text-charcoal tabular-nums">{health.runs}</dd>
          </div>
          {segments.map((segment) => (
            <div key={segment.key}>
              {statusMeta[segment.key].label}{' '}
              <dd className="inline font-semibold text-charcoal tabular-nums">{segment.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
        {errorKinds.length === 0 ? (
          <span className="text-xs text-ink-600">기록된 오류 없음</span>
        ) : (
          errorKinds.map((kind) => (
            <Badge key={kind} tone="muted">
              {errorKindLabel[kind]} {health.errorsByKind[kind]}
            </Badge>
          ))
        )}
      </div>
      <p className="mt-3 text-xs text-ink-600">마지막 종료 {formatKst(health.lastFinishedAt)}</p>
    </Card>
  );
}
