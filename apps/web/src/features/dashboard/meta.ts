import type { BadgeTone } from '../../components/ui/Badge';
import type { ChannelId, ConnectionStatus, TrackedContent, Verdict } from '../../types/content';

export const verdictMeta: Record<Verdict, { label: string; tone: BadgeTone; description: string }> =
  {
    excellent: {
      label: '우수',
      tone: 'positive',
      description: '같은 유형 평균보다 반응이 뚜렷하게 높음',
    },
    average: { label: '평균', tone: 'neutral', description: '같은 유형 평균 범위' },
    watch: {
      label: '관찰 필요',
      tone: 'caution',
      description: '반응이 줄어드는 추세라 다음 수집을 지켜봄',
    },
    'needs-work': {
      label: '개선 필요',
      tone: 'critical',
      description: '같은 유형 평균보다 뚜렷하게 낮음',
    },
    pending: { label: '평가 유예', tone: 'muted', description: '게시 후 3일이 지나지 않음' },
    insufficient: {
      label: '데이터 부족',
      tone: 'muted',
      description: '비교할 같은 유형 게시물이 5개 미만',
    },
  };

export const verdictOrder: Verdict[] = [
  'needs-work',
  'watch',
  'average',
  'excellent',
  'pending',
  'insufficient',
];

export const channelMeta: Record<ChannelId, { label: string; dotClass: string }> = {
  instagram: { label: 'Instagram', dotClass: 'bg-brand' },
  youtube: { label: 'YouTube', dotClass: 'bg-burgundy' },
  tiktok: { label: 'TikTok', dotClass: 'bg-charcoal' },
  threads: { label: 'Threads', dotClass: 'bg-tangerine' },
};

export const connectionMeta: Record<ConnectionStatus, { label: string; tone: BadgeTone }> = {
  connected: { label: 'API 연결', tone: 'positive' },
  'public-only': { label: '공개 지표만', tone: 'caution' },
  disconnected: { label: '연결 필요', tone: 'critical' },
};

export const formatLabel: Record<TrackedContent['format'], string> = {
  reels: '릴스',
  carousel: '캐러셀',
  feed: '피드',
  shorts: '숏폼',
  text: '텍스트',
};
