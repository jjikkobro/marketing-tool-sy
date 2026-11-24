import type { Brand, DashboardOverview, TrackedContent } from '../types/content';

/*
 * 데모 데이터. 실제 계정·성과 수치가 아니다.
 * 날짜는 "지금"을 기준으로 상대적으로 만들어서, 언제 열어도 D+N 표시가 자연스럽게 보이게 한다.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export const brands: Brand[] = [
  { id: 'buldak', name: '불닭볶음면' },
  { id: 'samyang', name: '삼양라면' },
  { id: 'maptang', name: '맵탱' },
  { id: 'tangle', name: '탱글' },
];

const lastSync = ago(2 * HOUR);

export const trackedContents: TrackedContent[] = [
  {
    id: 'c-001',
    title: '불닭 소스로 만드는 10분 로제 떡볶이',
    brandId: 'buldak',
    channel: 'instagram',
    format: 'reels',
    publishedAt: ago(1 * DAY + 3 * HOUR),
    views: 48_210,
    engagements: 3_912,
    verdict: 'pending',
    syncedAt: lastSync,
  },
  {
    id: 'c-002',
    title: '해외 팬이 뽑은 불닭 조합 TOP 5',
    brandId: 'buldak',
    channel: 'youtube',
    format: 'shorts',
    publishedAt: ago(4 * DAY),
    views: 182_400,
    engagements: 9_870,
    verdict: 'excellent',
    syncedAt: lastSync,
  },
  {
    id: 'c-003',
    title: '1963년부터 이어온 한 그릇, 삼양라면 이야기',
    brandId: 'samyang',
    channel: 'instagram',
    format: 'carousel',
    publishedAt: ago(5 * DAY),
    views: 12_380,
    engagements: 402,
    verdict: 'needs-work',
    syncedAt: lastSync,
  },
  {
    id: 'c-004',
    title: '맵탱 매운맛 단계별 리액션 챌린지',
    brandId: 'maptang',
    channel: 'tiktok',
    format: 'shorts',
    publishedAt: ago(6 * DAY),
    views: 96_050,
    engagements: 7_340,
    verdict: 'excellent',
    syncedAt: lastSync,
  },
  {
    id: 'c-005',
    title: '야근 끝 한 끼, 탱글 비빔면 3분 레시피',
    brandId: 'tangle',
    channel: 'instagram',
    format: 'reels',
    publishedAt: ago(7 * DAY),
    views: 21_700,
    engagements: 1_120,
    verdict: 'average',
    syncedAt: lastSync,
  },
  {
    id: 'c-006',
    title: '불닭 처음 먹는 사람을 위한 맵기 가이드',
    brandId: 'buldak',
    channel: 'threads',
    format: 'text',
    publishedAt: ago(8 * DAY),
    views: null,
    engagements: 214,
    verdict: 'watch',
    syncedAt: lastSync,
  },
  {
    id: 'c-007',
    title: '라면 물 조절, 계량컵 없이 맞추는 법',
    brandId: 'samyang',
    channel: 'youtube',
    format: 'shorts',
    publishedAt: ago(9 * DAY),
    views: 34_900,
    engagements: 1_480,
    verdict: 'average',
    syncedAt: lastSync,
  },
  {
    id: 'c-008',
    title: '맵탱 신제품 첫인상 인터뷰',
    brandId: 'maptang',
    channel: 'instagram',
    format: 'feed',
    publishedAt: ago(11 * DAY),
    views: 8_420,
    engagements: 266,
    verdict: 'needs-work',
    syncedAt: lastSync,
  },
  {
    id: 'c-009',
    title: '탱글로 차리는 여름 캠핑 메뉴',
    brandId: 'tangle',
    channel: 'threads',
    format: 'text',
    publishedAt: ago(12 * DAY),
    views: null,
    engagements: 88,
    verdict: 'insufficient',
    syncedAt: lastSync,
  },
];

export const dashboardOverview: DashboardOverview = {
  trackedCount: trackedContents.length,
  publishedToday: 1,
  needsWorkCount: trackedContents.filter((c) => c.verdict === 'needs-work').length,
  pendingCount: trackedContents.filter(
    (c) => c.verdict === 'pending' || c.verdict === 'insufficient',
  ).length,
  channels: [
    {
      channel: 'instagram',
      handle: '@demo.brand',
      status: 'connected',
      followers: 128_400,
      posts: 4,
      views: 90_710,
      engagements: 5_700,
      needsWork: 2,
      syncedAt: lastSync,
    },
    {
      channel: 'youtube',
      handle: '@demo.brand',
      status: 'connected',
      followers: 342_000,
      posts: 2,
      views: 217_300,
      engagements: 11_350,
      needsWork: 0,
      syncedAt: lastSync,
    },
    {
      channel: 'tiktok',
      handle: '@demo.brand',
      status: 'public-only',
      followers: 87_900,
      posts: 1,
      views: 96_050,
      engagements: 7_340,
      needsWork: 0,
      syncedAt: lastSync,
    },
    {
      channel: 'threads',
      handle: '@demo.brand',
      status: 'disconnected',
      followers: null,
      posts: 2,
      views: null,
      engagements: 302,
      needsWork: 0,
      syncedAt: null,
    },
  ],
};
