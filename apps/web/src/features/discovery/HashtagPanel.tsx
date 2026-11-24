import type { HashtagStat } from '@studio/collector/schema';
import { Card, CardHeader } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { formatCompact } from '../../lib/format';

interface HashtagPanelProps {
  hashtags: HashtagStat[];
  related: Record<string, HashtagStat[]>;
  selected: string | null;
  onSelect: (hashtag: string | null) => void;
}

export function HashtagPanel({ hashtags, related, selected, onSelect }: HashtagPanelProps) {
  const max = Math.max(1, ...hashtags.map((tag) => tag.contents));
  const suggestions = selected ? (related[selected] ?? []) : [];

  return (
    <Card>
      <CardHeader
        title="해시태그"
        description="선택하면 콘텐츠를 좁히고 함께 쓰인 태그를 보여줍니다."
      />
      <ul className="px-3 py-2">
        {hashtags.map((tag) => {
          const active = tag.hashtag === selected;
          return (
            <li key={tag.hashtag}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : tag.hashtag)}
                className={cn(
                  'w-full rounded-square px-3 py-2 text-left transition-colors',
                  active ? 'bg-brand-50' : 'hover:bg-ink-50',
                )}
              >
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={cn('truncate', active && 'font-semibold')}>#{tag.hashtag}</span>
                  <span className="text-xs text-ink-600 tabular-nums">{tag.contents}건</span>
                </span>
                <span aria-hidden className="mt-1.5 block h-1 rounded-full bg-ink-100">
                  <span
                    className={cn('block h-1 rounded-full', active ? 'bg-brand' : 'bg-ink-300')}
                    style={{ width: `${(tag.contents / max) * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="border-t border-ink-200 px-6 py-4">
          <p className="text-xs font-semibold text-charcoal">다음 수집 키워드 후보</p>
          <p className="mt-0.5 text-xs text-ink-600">#{selected}와 같은 게시물에 함께 쓰인 순서</p>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-xs text-ink-600">함께 쓰인 해시태그가 없습니다.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.map((tag) => (
                <li
                  key={tag.hashtag}
                  className="rounded-full border border-ink-200 px-2.5 py-1 text-xs"
                  title={`함께 쓰인 게시물 ${tag.contents}건 · 조회 합계 ${formatCompact(tag.totalViews)}`}
                >
                  #{tag.hashtag} <span className="text-ink-600 tabular-nums">{tag.contents}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
