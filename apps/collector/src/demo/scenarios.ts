/**
 * 키 없이 돌리는 데모 시나리오.
 *
 * - normal: 정상 수집 3회. 두 번째 TikTok 실행은 같은 쿼리를 다시 돌려 멱등성(새 행 0, 갱신만)을 보여준다.
 * - browser: 실제 Chromium으로 가상 피드 v1→v2→v3을 수집한다. 마크업 변화가 어떻게 기록되는지 보여준다.
 * - full: failures + browser.
 * - agent: full + 에이전트 계획·가드·승인 데모 (demo/agent-demo.ts). 웹 화면용 스냅샷은 이 시나리오로 만든다.
 * - failures: normal 이후 실패 상황을 차례로 재현한다.
 *   429 재시도 성공 → 503 연속으로 부분 실패 → 토큰 만료(재시도 안 함) →
 *   문서와 다른 필드명(video_id) + 식별 불가 항목 + 페이지 상한 → 좋아요 필드 소실 감지 + Graph 한도 오류 재시도
 */
import { fileURLToPath } from 'node:url';
import { browserFeedAdapter } from '../adapters/browser-feed.ts';
import { instagramGraphAdapter } from '../adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../adapters/tiktok-research.ts';
import type { HttpResponse, SourceAdapter } from '../adapters/types.ts';
import type { Db } from '../db/database.ts';
import { runCollection, type RunResult } from '../pipeline/run-collection.ts';
import type { CollectQuery } from '../schema.ts';
import {
  graphError,
  httpError,
  igHashtagSearch,
  igRecentMedia,
  ok,
  scriptedTransport,
  tiktokPage,
  type InstagramMediaSeed,
  type TikTokVideoSeed,
} from './fixtures.ts';

export type ScenarioName = 'normal' | 'failures' | 'browser' | 'full' | 'agent';
export const SCENARIOS: readonly ScenarioName[] = [
  'normal',
  'failures',
  'browser',
  'full',
  'agent',
];

export interface ScenarioStep {
  label: string;
  adapter: SourceAdapter;
  query: CollectQuery;
  maxPages?: number;
}

const TOKEN = 'demo-token';
const IG_USER = '17841400000000000';
const SPICY = ['spicynoodlechallenge', 'spicyfood', 'foodtok'];

function video(n: number, overrides: Partial<TikTokVideoSeed> = {}): TikTokVideoSeed {
  return {
    id: `73${String(n).padStart(17, '0')}`,
    username: `demo_creator_${String((n % 12) + 1).padStart(2, '0')}`,
    description: `Day ${n} of the spicy noodle challenge #spicynoodlechallenge`,
    hashtags:
      n % 3 === 0
        ? [...SPICY, 'mukbang']
        : n % 3 === 1
          ? [...SPICY, 'koreanfood']
          : [...SPICY, 'ramenhack'],
    hoursAgo: n * 5,
    views: 12_000 + ((n * 7919) % 180_000),
    likes: 800 + ((n * 613) % 21_000),
    comments: 20 + ((n * 97) % 900),
    shares: 5 + ((n * 37) % 400),
    ...overrides,
  };
}

function range(
  from: number,
  to: number,
  overrides: Partial<TikTokVideoSeed> = {},
): TikTokVideoSeed[] {
  return Array.from({ length: to - from + 1 }, (_, i) => video(from + i, overrides));
}

function media(n: number, overrides: Partial<InstagramMediaSeed> = {}): InstagramMediaSeed {
  return {
    id: `1789${String(n).padStart(13, '0')}`,
    shortcode: `DmO${String(n).padStart(8, '0')}`,
    caption: `Trying the viral fire noodle recipe at home #spicynoodlechallenge #koreanfood #recipe${n % 2 ? ' #cheesy' : ''}`,
    mediaType: n % 2 ? 'VIDEO' : 'CAROUSEL_ALBUM',
    hoursAgo: n * 2,
    likes: 150 + ((n * 211) % 4_000),
    comments: 3 + ((n * 17) % 120),
    ...overrides,
  };
}

const NEXT = (page: number) =>
  `https://graph.facebook.com/v27.0/17843857450040591/recent_media?page=${page}`;

const MOCK_FEED = (version: 'v1' | 'v2' | 'v3') =>
  fileURLToPath(new URL(`../../fixtures/mock-feed/${version}.html`, import.meta.url));

function browserSteps(now: Date): ScenarioStep[] {
  const query = { kind: 'hashtag', value: 'spicynoodlechallenge' } as const;
  const feed = (version: 'v1' | 'v2' | 'v3') =>
    browserFeedAdapter({ pageFile: MOCK_FEED(version), now: () => now });
  return [
    { label: '브라우저: 가상 피드 v1 (기준)', adapter: feed('v1'), query },
    {
      label: '브라우저: v2 — 조회수 요소 클래스 변경 (수집은 되지만 값이 빔)',
      adapter: feed('v2'),
      query,
    },
    { label: '브라우저: v3 — 카드 마크업 전면 개편 (셀렉터 0건)', adapter: feed('v3'), query },
  ];
}

export function buildScenario(name: ScenarioName, now: Date): ScenarioStep[] {
  if (name === 'browser') return browserSteps(now);
  if (name === 'full' || name === 'agent')
    return [...buildScenario('failures', now), ...browserSteps(now)];

  const tiktok = (steps: HttpResponse[]) =>
    tiktokResearchAdapter({
      transport: scriptedTransport(steps),
      accessToken: TOKEN,
      now: () => now,
    });
  const instagram = (steps: HttpResponse[]) =>
    instagramGraphAdapter({
      transport: scriptedTransport(steps),
      accessToken: TOKEN,
      igUserId: IG_USER,
    });

  const normal: ScenarioStep[] = [
    {
      label: 'TikTok 키워드 수집 (2페이지, 페이지 사이 중복 2건)',
      adapter: tiktok([
        ok(tiktokPage(range(1, 8), { now, cursor: 8, hasMore: true })),
        ok(tiktokPage(range(7, 14), { now, cursor: 16, hasMore: false })),
      ]),
      query: { kind: 'keyword', value: 'spicy noodle challenge' },
    },
    {
      label: 'Instagram 해시태그 수집 (좋아요 숨김 1건, /reel/ URL 포함)',
      adapter: instagram([
        ok(igHashtagSearch('17843857450040591')),
        ok(
          igRecentMedia(
            [
              media(1),
              media(2, { likes: null }),
              media(3, { path: 'reel' }),
              media(4),
              media(5),
              media(6),
            ],
            {
              now,
              next: NEXT(2),
            },
          ),
        ),
        ok(igRecentMedia([media(7), media(8), media(9), media(10), media(11)], { now })),
      ]),
      query: { kind: 'hashtag', value: 'spicynoodlechallenge' },
    },
    {
      label: 'TikTok 같은 쿼리 재실행 (새 행 0, 지표만 갱신되어야 함)',
      adapter: tiktok([
        ok(
          tiktokPage(
            range(1, 8).map((v) => ({ ...v, views: (v.views ?? 0) + 1_500 })),
            { now, cursor: 8, hasMore: true },
          ),
        ),
        ok(
          tiktokPage(
            range(9, 14).map((v) => ({ ...v, views: (v.views ?? 0) + 900 })),
            { now, cursor: 14, hasMore: false },
          ),
        ),
      ]),
      query: { kind: 'keyword', value: 'spicy noodle challenge' },
    },
  ];

  if (name === 'normal') return normal;

  return [
    ...normal,
    {
      label: '429 → Retry-After 대기 후 성공, 이어서 503이 계속되어 부분 실패',
      adapter: tiktok([
        ok(tiktokPage(range(20, 27), { now, cursor: 8, hasMore: true })),
        httpError(
          429,
          { error: { code: 'rate_limit_exceeded', message: '' } },
          { 'retry-after': '1' },
        ),
        ok(tiktokPage(range(28, 35), { now, cursor: 16, hasMore: true })),
        httpError(503, '<html>Service Unavailable</html>'),
        httpError(503, '<html>Service Unavailable</html>'),
        httpError(503, '<html>Service Unavailable</html>'),
        httpError(503, '<html>Service Unavailable</html>'),
      ]),
      query: { kind: 'keyword', value: 'fire noodle' },
    },
    {
      label: 'Instagram 토큰 만료 (code 190) — 재시도하지 않고 즉시 실패',
      adapter: instagram([
        ok(igHashtagSearch('17841562391078012')),
        graphError(190, 'Error validating access token: Session has expired.'),
      ]),
      query: { kind: 'hashtag', value: 'koreanramen' },
    },
    {
      label: '문서와 다른 필드명(video_id) + 식별 불가 항목 + 페이지 상한 도달',
      adapter: tiktok([
        ok(
          tiktokPage(
            [
              ...range(40, 45, { hashtags: ['mukbang', 'spicyfood', 'asmr'] }),
              video(46, { id: null }),
            ],
            {
              now,
              cursor: 7,
              hasMore: true,
              idField: 'video_id',
            },
          ),
        ),
        ok(
          tiktokPage(range(47, 52, { hashtags: ['mukbang', 'asmr'] }), {
            now,
            cursor: 13,
            hasMore: true,
            idField: 'video_id',
          }),
        ),
      ]),
      query: { kind: 'hashtag', value: 'mukbang' },
      maxPages: 2,
    },
    {
      label: 'Graph 호출 한도(code 4) 재시도 후, 응답에서 좋아요 필드가 통째로 사라짐',
      adapter: instagram([
        graphError(4, 'Application request limit reached'),
        ok(igHashtagSearch('17843857450040591')),
        ok(
          igRecentMedia(
            Array.from({ length: 8 }, (_, i) => media(20 + i, { likes: null })),
            { now },
          ),
        ),
      ]),
      query: { kind: 'hashtag', value: 'spicynoodlechallenge' },
    },
  ];
}

export async function runScenario(
  db: Db,
  name: ScenarioName,
  {
    now = new Date(),
    onStep,
  }: { now?: Date; onStep?: (step: ScenarioStep, result: RunResult) => void } = {},
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const step of buildScenario(name, now)) {
    const result = await runCollection(db, step.adapter, step.query, {
      maxPages: step.maxPages,
      // 데모는 실제로 기다리지 않는다. 대기 시간은 실행 기록에 그대로 남는다.
      retry: { sleep: async () => {}, random: () => 0.5 },
      now: () => now,
    });
    onStep?.(step, result);
    results.push(result);
  }
  return results;
}
