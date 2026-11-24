import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { daysSince, formatDateTime, formatNumber, formatPercent } from '../../lib/format';
import type { Brand, ChannelId, TrackedContent, Verdict } from '../../types/content';
import { channelMeta, formatLabel, verdictMeta, verdictOrder } from './meta';

interface ContentTrackingTableProps {
  contents: TrackedContent[];
  brands: Brand[];
}

type Filter<T extends string> = T | 'all';

const selectClass =
  'h-9 rounded-square border border-ink-300 bg-white px-3 text-sm text-charcoal hover:border-ink-400';

export function ContentTrackingTable({ contents, brands }: ContentTrackingTableProps) {
  const [channel, setChannel] = useState<Filter<ChannelId>>('all');
  const [verdict, setVerdict] = useState<Filter<Verdict>>('all');
  const [keyword, setKeyword] = useState('');

  const brandName = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands]);

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return contents.filter(
      (content) =>
        (channel === 'all' || content.channel === channel) &&
        (verdict === 'all' || content.verdict === verdict) &&
        (query === '' || content.title.toLowerCase().includes(query)),
    );
  }, [contents, channel, verdict, keyword]);

  return (
    <Card>
      <CardHeader
        title="게시물 성과 추적"
        description="게시 후 D+3, D+7 시점에 같은 유형 게시물과 비교해 판정합니다."
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-6 py-3">
        <label className="sr-only" htmlFor="filter-channel">
          채널
        </label>
        <select
          id="filter-channel"
          className={selectClass}
          value={channel}
          onChange={(event) => setChannel(event.target.value as Filter<ChannelId>)}
        >
          <option value="all">전체 채널</option>
          {Object.entries(channelMeta).map(([id, meta]) => (
            <option key={id} value={id}>
              {meta.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-verdict">
          판정
        </label>
        <select
          id="filter-verdict"
          className={selectClass}
          value={verdict}
          onChange={(event) => setVerdict(event.target.value as Filter<Verdict>)}
        >
          <option value="all">전체 판정</option>
          {verdictOrder.map((id) => (
            <option key={id} value={id}>
              {verdictMeta[id].label}
            </option>
          ))}
        </select>

        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            aria-label="제목 검색"
            placeholder="제목 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className={`${selectClass} w-full pl-9 placeholder:text-ink-500`}
          />
        </div>

        <span className="ml-auto text-xs text-ink-600" aria-live="polite">
          {rows.length}건
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-600">
              <th className="px-6 py-3 font-medium">게시</th>
              <th className="px-3 py-3 font-medium">콘텐츠</th>
              <th className="px-3 py-3 text-right font-medium">조회</th>
              <th className="px-3 py-3 text-right font-medium">반응</th>
              <th className="px-3 py-3 text-right font-medium">반응률</th>
              <th className="px-6 py-3 text-center font-medium">판정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((content) => {
              const engagementRate =
                content.views && content.engagements !== null
                  ? content.engagements / content.views
                  : null;
              const meta = verdictMeta[content.verdict];

              return (
                <tr key={content.id} className="border-t border-ink-100 hover:bg-ink-50">
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <div className="tabular-nums">{formatDateTime(content.publishedAt)}</div>
                    <div className="font-display text-[11px] text-ink-500">
                      D+{daysSince(content.publishedAt)}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-medium">{content.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-600">
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${channelMeta[content.channel].dotClass}`}
                      />
                      {channelMeta[content.channel].label} · {formatLabel[content.format]} ·{' '}
                      {brandName.get(content.brandId)}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {formatNumber(content.views)}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {formatNumber(content.engagements)}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {formatPercent(engagementRate)}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <Badge tone={meta.tone}>
                      <span title={meta.description}>{meta.label}</span>
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-ink-600">
            조건에 맞는 게시물이 없습니다.
          </p>
        )}
      </div>
    </Card>
  );
}
