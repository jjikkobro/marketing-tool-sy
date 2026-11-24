import type { Snapshot } from '@studio/collector/schema';
import { Card, CardHeader } from '../../components/ui/Card';
import { formatCompact } from '../../lib/format';

const FORMAT_LABEL: Record<string, string> = {
  challenge: '챌린지',
  recipe_hack: '레시피·꿀팁',
  mukbang_asmr: '먹방·ASMR',
  reaction_review: '리액션·리뷰',
  other: '기타',
};

/**
 * 포맷별 집계. 해시태그는 주제이고, 브랜드가 실제로 기획하는 단위는 포맷이다.
 * 분류는 공개된 규칙으로 하며(core/format.ts), YouTube 데이터는 정책상 집계에서 뺀다.
 */
export function FormatPanel({ formats }: { formats: Snapshot['formats'] }) {
  const max = Math.max(1, ...formats.map((f) => f.contents));
  return (
    <Card>
      <CardHeader title="포맷" description="기획 단위로 묶은 집계 (규칙 기반, YouTube 제외)" />
      <ul className="space-y-3 px-6 py-4">
        {formats.map((stat) => (
          <li key={stat.format}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{FORMAT_LABEL[stat.format] ?? stat.format}</span>
              <span className="text-xs text-ink-600 tabular-nums">
                {stat.contents}건 · 조회 {formatCompact(stat.totalViews)}
              </span>
            </div>
            <span aria-hidden className="mt-1.5 block h-1 rounded-full bg-ink-100">
              <span
                className="block h-1 rounded-full bg-charcoal"
                style={{ width: `${(stat.contents / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
