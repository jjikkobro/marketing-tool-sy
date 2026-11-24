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
  /** 녹화 데이터면 공식 API·브라우저 행의 URL이 실제로 존재하지 않으므로 링크를 걸지 않는다 */
  recorded: boolean;
}

export function ContentTable({ contents, hashtag, recorded }: ContentTableProps) {
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
              <th className="w-28 px-6 py-3 font-medium">게시</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((content) => (
              <tr
                key={`${content.platform}:${content.platformContentId}`}
                className="border-t border-ink-100 align-top hover:bg-ink-50"
              >
                <td className="px-6 py-3.5">
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
                    // YouTube·검색 API 행은 실제 게시물이라 항상 원본으로 연결한다 (YouTube 정책 III.I.4: 링크를 제거하지 않는다).
                    // 브라우저 행은 저장소 안의 가상 피드라 어느 모드에서도 실제 게시물이 없다.
                    <SourceLink
                      url={content.url}
                      recorded={
                        content.source === 'browser' ||
                        (recorded &&
                          content.platform !== 'youtube' &&
                          content.source !== 'web-search')
                      }
                      youtube={content.platform === 'youtube'}
                    />
                  )}
                </td>
                <MetricCell value={content.metrics.views} />
                <MetricCell value={content.metrics.likes} />
                <MetricCell value={content.metrics.comments} />
                <td className="px-6 py-3.5 text-xs text-ink-600 tabular-nums">
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

/**
 * 원본 링크. 녹화 데이터의 URL(가상 계정·가상 게시물)은 열어도 없는 페이지라,
 * 클릭할 수 있게 두면 고장 난 것처럼 보인다. 그래서 링크 대신 "어떤 URL로 저장되는지"만 보여준다.
 */
function SourceLink({
  url,
  recorded,
  youtube = false,
}: {
  url: string;
  recorded: boolean;
  youtube?: boolean;
}) {
  if (recorded) {
    return (
      <p
        className="mt-1 flex max-w-md min-w-0 items-center gap-1.5 text-xs text-ink-500"
        title="녹화된 가상 데이터라 실제 게시물이 없습니다. 실서비스 수집에서는 원본 링크로 열립니다."
      >
        <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-ink-600">
          가상 URL
        </span>
        <span className="min-w-0 truncate font-mono">{url.replace(/^https:\/\//, '')}</span>
      </p>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-xs text-ink-600 hover:text-brand-700"
    >
      {youtube ? 'YouTube에서 보기 · YouTube 제공 데이터' : '원본 링크'}{' '}
      <ExternalLink aria-hidden className="size-3" />
      <span className="sr-only">(새 창)</span>
    </a>
  );
}
