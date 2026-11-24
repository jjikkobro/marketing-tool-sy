import type { LiveStatus } from '@studio/collector/schema';
import { cn } from '../../lib/cn';

const SOCIAL_PLATFORMS: readonly ('tiktok' | 'instagram')[] = ['tiktok', 'instagram'];

const SOCIAL_SOURCE: Record<
  LiveStatus['sources']['tiktok'],
  { value: string; hint: string | null }
> = {
  official: { value: '공식 API', hint: null },
  search: {
    value: '검색 API · 실제 공개 게시물',
    hint: '공식 API는 계정 승인이 필요해 꺼 둠. 조회수·좋아요는 없음(—)',
  },
  recorded: {
    value: '녹화된 가상 데이터',
    hint: '공식 API 권한·검색 API 키가 없어 공식 응답 형식의 녹화본 사용',
  },
};

/**
 * 무엇이 실시간이고 무엇이 녹화인지 항상 보이게 한다.
 * 심사자가 "AI가 정말 지금 돌았는가"를 의심하지 않아도 되게 하고, SNS 데이터가 가상이라는 점도 숨기지 않는다.
 */
export function LiveStatusCard({
  live,
  compact = false,
}: {
  live: LiveStatus | null;
  compact?: boolean;
}) {
  const rows = live
    ? [
        {
          label: 'AI 계획',
          value: live.claude.enabled
            ? `Claude 실시간 · ${live.claude.model}`
            : '녹화 응답 (API 키 없음)',
          on: live.claude.enabled,
          hint: live.claude.enabled
            ? `내 남은 호출 ${live.claude.remainingForSession}회 · 오늘 ${live.claude.remainingToday}회`
            : null,
        },
        { label: '가드·승인·실행', value: '실시간 (내 샌드박스)', on: true, hint: null },
        {
          label: 'YouTube 수집',
          value:
            live.sources.youtube === 'live' ? '실제 API 수집 (YouTube 제공)' : '꺼짐 (API 키 없음)',
          on: live.sources.youtube === 'live',
          hint: live.sources.youtube === 'live' ? '30일 보관·집계 제외 등 YouTube 정책 준수' : null,
        },
        ...SOCIAL_PLATFORMS.map((platform) => {
          const source = live.sources[platform];
          return {
            label: `${platform === 'tiktok' ? 'TikTok' : 'Instagram'} 수집`,
            value: SOCIAL_SOURCE[source].value,
            on: source !== 'recorded',
            hint: SOCIAL_SOURCE[source].hint,
          };
        }),
      ]
    : [
        {
          label: '모드',
          value: '정적 스냅샷 (읽기 전용)',
          on: false,
          hint: '라이브 서버에서 열면 AI 호출과 승인이 가능합니다',
        },
      ];

  return (
    <dl className={cn('space-y-2', compact ? 'text-[11px]' : 'text-xs')}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="flex items-center gap-1.5 text-ink-600">
            <span
              aria-hidden
              className={cn('size-1.5 rounded-full', row.on ? 'bg-positive' : 'bg-tangerine')}
            />
            {row.label}
          </dt>
          <dd className="mt-0.5 font-semibold text-charcoal">{row.value}</dd>
          {row.hint && <dd className="text-ink-500">{row.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
