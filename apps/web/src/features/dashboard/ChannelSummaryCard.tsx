import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { formatCompact, formatDateTime, formatNumber } from '../../lib/format';
import type { ChannelSummary } from '../../types/content';
import { channelMeta, connectionMeta } from './meta';

export function ChannelSummaryCard({ summary }: { summary: ChannelSummary }) {
  const channel = channelMeta[summary.channel];
  const connection = connectionMeta[summary.status];

  const metrics = [
    { label: '팔로워', value: formatCompact(summary.followers) },
    { label: '게시물', value: formatNumber(summary.posts) },
    { label: '조회', value: formatCompact(summary.views) },
    { label: '반응', value: formatCompact(summary.engagements) },
  ];

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`size-2 rounded-full ${channel.dotClass}`} />
          <span className="font-display text-sm font-semibold">{channel.label}</span>
        </div>
        <Badge tone={connection.tone}>{connection.label}</Badge>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-[11px] text-ink-600">{metric.label}</dt>
            <dd className="mt-0.5 font-display text-base font-semibold tabular-nums">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-600">
        <span>
          개선 필요{' '}
          <strong className={summary.needsWork > 0 ? 'text-burgundy' : 'text-charcoal'}>
            {summary.needsWork}
          </strong>
        </span>
        <span>
          {summary.syncedAt ? `${formatDateTime(summary.syncedAt)} 수집` : '수집 기록 없음'}
        </span>
      </div>
    </Card>
  );
}
