/**
 * 검색 API(Tavily) 어댑터와 공식 API 비활성화 규칙 (docs/decisions/0006)
 * 응답 형식은 Tavily 문서(POST /search)의 필드 이름을 따르고, URL과 값만 가상으로 채웠다.
 * - published_date는 RFC 1123 형식이고 null일 수 있다 (실제 TikTok·Instagram 결과에는 거의 없다, 0002 §9)
 * - 게시물 ID는 생성 시각을 담도록 계산했다 (TikTok: 상위 32비트 초, Instagram: 단축 코드 → 미디어 ID)
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifySearchError,
  parsePostUrl,
  pickCaption,
  postedAtFromId,
  webSearchAdapter,
} from '../src/adapters/web-search.ts';
import { collectUnavailableReason, sourcesFromEnv } from '../src/agent/availability.ts';
import { verifyProposal } from '../src/agent/guard.ts';
import { buildObservation } from '../src/agent/observation.ts';
import { webSearchesToday } from '../src/agent/search-quota.ts';
import { openDatabase } from '../src/db/database.ts';
import { ok, scriptedTransport } from '../src/demo/fixtures.ts';
import { runCollection } from '../src/pipeline/run-collection.ts';
import { searchContents } from '../src/queries/index.ts';

const now = new Date('2026-11-24T03:00:00Z');

function tavilyBody(results: Array<Record<string, unknown>>) {
  return JSON.stringify({
    query: 'spicy noodle challenge',
    answer: null,
    images: [],
    results,
    response_time: 1.2,
    request_id: 'req-1',
  });
}

const TIKTOK_RESULTS = [
  {
    title: 'Spicy noodle challenge #spicynoodles #foodtok',
    url: 'https://www.tiktok.com/@demo_creator_01/video/7710933457148325945?lang=en',
    content: 'Trying the spicy noodle challenge for the first time #spicynoodles',
    score: 0.9,
    published_date: 'Sat, 22 Nov 2026 10:00:00 GMT',
  },
  {
    title: 'demo_creator_02 profile',
    url: 'https://www.tiktok.com/@demo_creator_02',
    content: 'profile page',
    score: 0.5,
    published_date: 'Sat, 22 Nov 2026 10:00:00 GMT',
  },
  {
    title: 'No date',
    url: 'https://www.tiktok.com/@demo_creator_03/video/7397954036328050745',
    content: 'no date',
    score: 0.4,
    published_date: null,
  },
];

describe('검색 API 어댑터', () => {
  it('게시물 URL만 받아들이고, 지표는 0이 아니라 null로 둔다', async () => {
    const transport = scriptedTransport([ok(tavilyBody(TIKTOK_RESULTS))]);
    const adapter = webSearchAdapter({
      transport,
      apiKey: 'tvly-test',
      platform: 'tiktok',
      now: () => now,
    });
    const page = adapter.parsePage(
      await adapter.fetchPage({ kind: 'keyword', value: 'spicy noodle challenge' }, null),
      { kind: 'keyword', value: 'spicy noodle challenge' },
    );

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      platform: 'tiktok',
      platformContentId: '7710933457148325945',
      url: 'https://www.tiktok.com/@demo_creator_01/video/7710933457148325945',
      creatorHandle: 'demo_creator_01',
      mediaType: 'video',
      publishedAt: '2026-11-22T10:00:00.000Z',
      metrics: { views: null, likes: null, comments: null, shares: null },
    });
    expect(page.items[0]?.hashtags).toEqual(['spicynoodles', 'foodtok']);
    // 프로필 페이지·기간 밖 게시물은 정상적인 걸러냄이라 오류(rejected)가 아니다 (0002 §10)
    expect(page.rejected).toEqual([]);
    expect(page.skipped?.map((r) => r.reason)).toEqual([
      '게시물 URL이 아님',
      '최근 30일보다 오래됨',
    ]);

    // 요청: 도메인 제한(= site:tiktok.com), 최근 1주, 게시일 포함, 키는 헤더로만
    const request = transport.requests[0];
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('https://api.tavily.com/search');
    expect(request?.headers?.authorization).toBe('Bearer tvly-test');
    expect(request?.body).toMatchObject({
      include_domains: ['tiktok.com'],
      time_range: 'week',
      include_published_date: true,
      max_results: 20,
    });
  });

  it('게시일은 ID에서 계산하고, 검색 API의 날짜와 2일 넘게 다르면 구조 변화 경고를 남긴다', () => {
    expect(postedAtFromId('tiktok', '7710933457148325945', now)?.toISOString()).toBe(
      '2026-11-22T10:00:00.000Z',
    );
    expect(postedAtFromId('instagram', 'Df7B7sTgAMJ', now)?.toISOString().slice(0, 16)).toBe(
      '2026-11-19T12:00',
    );
    // 말이 안 되는 시각(2016년 이전)은 지어내지 않고 null
    expect(postedAtFromId('tiktok', '100000000000000000', now)).toBeNull();
    expect(postedAtFromId('instagram', 'AAAA', now)).toBeNull();

    const adapter = webSearchAdapter({
      transport: scriptedTransport([]),
      apiKey: 'k',
      platform: 'tiktok',
      now: () => now,
    });
    const page = adapter.parsePage(
      tavilyBody([
        {
          title: 't',
          url: 'https://www.tiktok.com/@demo_creator_05/video/7710160363035045945',
          content: 'c',
          published_date: 'Sat, 01 Nov 2026 00:00:00 GMT',
        },
      ]),
      { kind: 'keyword', value: 'x' },
    );
    expect(page.items).toHaveLength(1);
    expect(page.warnings).toEqual([expect.objectContaining({ kind: 'schema_drift' })]);
  });

  it('본문이 페이지 메뉴 글자면 제목을 캡션으로 쓴다', () => {
    expect(
      pickCaption(
        'Korean snacks haul #koreanfood',
        '# TikTok - Make Your Day TikTok Log in TikTok Search For You Explore Following',
      ),
    ).toBe('Korean snacks haul #koreanfood');
    expect(pickCaption('제목', '매운 라면에 치즈를 넣어 봤어요')).toBe(
      '매운 라면에 치즈를 넣어 봤어요',
    );
    expect(pickCaption(undefined, 'Log in')).toBe('Log in');
  });

  it('Instagram 게시물·릴스 URL에서 단축 코드를 뽑고, 다른 도메인은 거부한다', () => {
    expect(parsePostUrl('instagram', 'https://www.instagram.com/reel/DmXyZ12_ab/?igsh=1')).toEqual({
      id: 'DmXyZ12_ab',
      url: 'https://www.instagram.com/reel/DmXyZ12_ab/',
      creator: null,
      mediaType: 'video',
    });
    expect(
      parsePostUrl('instagram', 'https://www.instagram.com/demo_creator_04/p/DmA1/'),
    ).toMatchObject({ id: 'DmA1', creator: 'demo_creator_04', mediaType: 'unknown' });
    expect(parsePostUrl('instagram', 'https://www.instagram.com/explore/tags/ramen/')).toBeNull();
    expect(parsePostUrl('instagram', 'https://instagram.com.evil.example/p/DmA1/')).toBeNull();
    expect(
      parsePostUrl('tiktok', 'https://www.tiktok.com/@a/photo/7400000000000000009'),
    ).toMatchObject({ mediaType: 'image' });
  });

  it('같은 게시물이 다시 검색되면 새 행이 아니라 중복으로 합친다', async () => {
    const db = openDatabase(':memory:');
    const body = tavilyBody(TIKTOK_RESULTS);
    const adapter = () =>
      webSearchAdapter({
        transport: scriptedTransport([ok(body)]),
        apiKey: 'tvly-test',
        platform: 'tiktok',
        now: () => now,
      });
    const query = { kind: 'keyword', value: 'spicy noodle challenge' } as const;
    const first = await runCollection(db, adapter(), query, { now: () => now });
    const second = await runCollection(db, adapter(), query, { now: () => now });

    expect(first.counters.inserted).toBe(1);
    expect(first.counters.rejected).toBe(0);
    // 걸러낸 항목은 오류 기록에 남지 않는다
    expect(db.prepare('SELECT COUNT(*) AS n FROM collection_error').get()).toEqual({ n: 0 });
    expect(second.counters.inserted).toBe(0);
    // 마이그레이션 005: source CHECK가 web-search를 받아들인다
    expect(searchContents(db, {}).map((c) => c.source)).toEqual(['web-search']);
    expect(webSearchesToday(db, now)).toBe(2);
  });

  it('오류를 상태 코드로 분류한다 (432·433은 재시도해도 풀리지 않는 한도)', () => {
    const body = JSON.stringify({ detail: { error: 'Unauthorized: missing or invalid API key.' } });
    expect(classifySearchError(401, body, undefined)).toMatchObject({ kind: 'auth' });
    expect(classifySearchError(429, '{}', '3')).toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 3000,
    });
    expect(classifySearchError(432, '{}', undefined)).toMatchObject({ kind: 'quota_exhausted' });
    expect(classifySearchError(433, '{}', undefined)).toMatchObject({ kind: 'quota_exhausted' });
    expect(classifySearchError(502, '<html>', undefined)).toMatchObject({ kind: 'server' });
    expect(classifySearchError(422, '{"detail":[{"msg":"x"}]}', undefined)).toMatchObject({
      kind: 'invalid_response',
    });
  });
});

describe('수집 경로 선택 (공식 API 비활성화)', () => {
  afterEach(() => {
    delete process.env.TAVILY_API_KEY;
  });

  it('키가 하나도 없으면 녹화 데모, 검색 키가 있으면 검색 API, 공식 토큰이 있으면 공식 API', () => {
    expect(sourcesFromEnv({})).toEqual({
      youtube: 'off',
      tiktok: 'recorded',
      instagram: 'recorded',
    });
    expect(sourcesFromEnv({ TAVILY_API_KEY: 'k' })).toMatchObject({
      tiktok: 'search',
      instagram: 'search',
    });
    expect(sourcesFromEnv({ TAVILY_API_KEY: 'k', TIKTOK_RESEARCH_TOKEN: 't' })).toMatchObject({
      tiktok: 'official',
      instagram: 'search',
    });
  });

  it('검색 API가 켜져 있고 공식 토큰이 없으면 공식 어댑터로의 새 수집을 막는다', () => {
    const env = { TAVILY_API_KEY: 'k' };
    expect(collectUnavailableReason('tiktok-research', env)).toMatch(/search-tiktok/);
    expect(collectUnavailableReason('instagram-graph', env)).toMatch(/search-instagram/);
    expect(collectUnavailableReason('search-tiktok', env)).toBeNull();
    expect(collectUnavailableReason('search-tiktok', {})).toMatch(/TAVILY_API_KEY/);
    expect(collectUnavailableReason('tiktok-research', {})).toBeNull();
  });

  it('가드: 검색 키가 없으면 search-* 제안을 차단하고, 있으면 통과시킨다', () => {
    const db = openDatabase(':memory:');
    const draft = {
      kind: 'collect_query',
      title: 'ramen 수집',
      rationale: '근거',
      adapterId: 'search-tiktok',
      queryKind: 'hashtag',
      queryValue: 'ramen',
      runId: null,
      plan: null,
      evidence: ['quota:instagram-hashtags'],
      claims: [],
    };
    const capability = () =>
      verifyProposal(db, buildObservation(db, now), draft, now).checks.find(
        (c) => c.check === 'capability',
      );
    expect(capability()).toMatchObject({ passed: false });
    process.env.TAVILY_API_KEY = 'k';
    expect(capability()).toMatchObject({ passed: true });
  });
});
