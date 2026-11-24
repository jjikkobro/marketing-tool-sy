import { platformSchema, type Platform, type StoredContent } from '@studio/collector/schema';
import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { formatKst, formatNumber } from '../../lib/format';
import { platformLabel, sourceLabel } from '../../lib/labels';

const fieldClass =
  'h-9 rounded-square border border-ink-300 bg-white px-3 text-sm text-charcoal hover:border-ink-400';

/** select 값은 문자열이다. 단언(as) 대신 스키마로 검사해서 알 수 없는 값은 '전체'로 돌린다. */
function parsePlatformFilter(value: string): Platform | 'all' {
  const parsed = platformSchema.safeParse(value);
  return parsed.success ? parsed.data : 'all';
}

interface ContentTableProps {
  contents: StoredContent[];
  hashtag: string | null;
}

export function ContentTable({ contents, hashtag }: ContentTableProps) {
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [keyword, setKeyword] = useState('');

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return contents.filter(
      (content) =>
        (platform === 'all' || content.platform === platform) &&
        (hashtag === null || content.hashtags.includes(hashtag)) &&
        (query === '' || content.caption.toLowerCase().includes(query)),
    );
  }, [contents, platform, hashtag, keyword]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-6 py-3">
        <label className="sr-only" htmlFor="filter-platform">
          플랫폼
        </label>
        <select
          id="filter-platform"
          className={fieldClass}
          value={platform}
          onChange={(event) => setPlatform(parsePlatformFilter(event.target.value))}
        >
          <option value="all">전체 플랫폼</option>
          {platformSchema.options.map((id) => (
            <option key={id} value={id}>
              {platformLabel[id]}
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
            aria-label="캡션 검색"
            placeholder="캡션 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className={`${fieldClass} w-full pl-9 placeholder:text-ink-500`}
          />
        </div>
        <span className="ml-auto text-xs text-ink-600" aria-live="polite">
          {hashtag && <span className="mr-2 font-semibold text-charcoal">#{hashtag}</span>}
          {rows.length}건
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-600">
              <th className="px-6 py-3 font-medium">콘텐츠</th>
              <th className="px-3 py-3 text-right font-medium">조회</th>
              <th className="px-3 py-3 text-right font-medium">좋아요</th>
              <th className="px-3 py-3 text-right font-medium">댓글</th>
              <th className="px-6 py-3 font-medium whitespace-nowrap">게시</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((content) => (
              <tr
                key={`${content.platform}:${content.platformContentId}`}
                className="border-t border-ink-100 align-top hover:bg-ink-50"
              >
                <td className="max-w-xl px-6 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="neutral">{platformLabel[content.platform]}</Badge>
                    <Badge tone="muted">{sourceLabel[content.source]}</Badge>
                    {content.creatorHandle && (
                      <span className="truncate text-xs text-ink-600">
                        @{content.creatorHandle}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2">{content.caption || '(캡션 없음)'}</p>
                  {content.url && (
                    <a
                      href={content.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-ink-600 hover:text-brand-700"
                    >
                      원본 링크 <ExternalLink aria-hidden className="size-3" />
                      <span className="sr-only">(새 창, 가상 데이터라 열리지 않을 수 있음)</span>
                    </a>
                  )}
                </td>
                <MetricCell value={content.metrics.views} />
                <MetricCell value={content.metrics.likes} />
                <MetricCell value={content.metrics.comments} />
                <td className="px-6 py-3.5 text-xs whitespace-nowrap text-ink-600 tabular-nums">
                  {formatKst(content.publishedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-ink-600">
            조건에 맞는 콘텐츠가 없습니다.
          </p>
        )}
      </div>
    </Card>
  );
}

function MetricCell({ value }: { value: number | null }) {
  return (
    <td
      className="px-3 py-3.5 text-right tabular-nums"
      title={value === null ? '수집하지 못한 값입니다 (0이 아님)' : undefined}
    >
      <span className={value === null ? 'text-ink-400' : undefined}>{formatNumber(value)}</span>
    </td>
  );
}
