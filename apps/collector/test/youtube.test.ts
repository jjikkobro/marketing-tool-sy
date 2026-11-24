/**
 * YouTube Data API 어댑터와 정책 준수.
 * 응답 형식은 공식 문서(search.list, videos 리소스)에서 가져오고 값만 가상으로 채웠다.
 * - 통계 값은 문자열이다 ("viewCount": "3057")
 * - likeCount·commentCount가 빠지는 조건은 문서에 없으므로 빠진 경우도 시험한다
 */
import { describe, expect, it } from 'vitest';
import {
  classifyYouTubeError,
  isoDurationSeconds,
  youtubeDataAdapter,
} from '../src/adapters/youtube-data.ts';
import { verifyProposal } from '../src/agent/guard.ts';
import { buildObservation, factById } from '../src/agent/observation.ts';
import { openDatabase } from '../src/db/database.ts';
import { finishRun, startRun } from '../src/db/repository.ts';
import { ok, scriptedTransport } from '../src/demo/fixtures.ts';
import {
  pacificDayStart,
  purgeExpiredYouTube,
  youtubeSearchesToday,
} from '../src/core/youtube-policy.ts';
import { runCollection } from '../src/pipeline/run-collection.ts';
import { relatedHashtags, topHashtags } from '../src/queries/index.ts';

const now = new Date('2026-11-24T03:00:00Z');
const query = { kind: 'keyword', value: 'spicy noodle challenge' } as const;

function searchBody(ids: string[], next?: string) {
  return JSON.stringify({
    kind: 'youtube#searchListResponse',
    etag: 'etag',
    ...(next && { nextPageToken: next }),
    regionCode: 'US',
    pageInfo: { totalResults: ids.length, resultsPerPage: 25 },
    items: ids.map((videoId) => ({
      kind: 'youtube#searchResult',
      etag: 'e',
      id: { kind: 'youtube#video', videoId },
      snippet: {
        publishedAt: '2026-11-20T10:00:00Z',
        channelId: 'UC1',
        title: 't',
        description: '',
        thumbnails: {},
        channelTitle: 'c',
        liveBroadcastContent: 'none',
      },
    })),
  });
}

function videosBody(
  videos: Array<{
    id: string;
    title: string;
    views?: string;
    likes?: string;
    comments?: string;
    channel?: string;
  }>,
) {
  return JSON.stringify({
    kind: 'youtube#videoListResponse',
    items: videos.map((v) => ({
      kind: 'youtube#video',
      id: v.id,
      snippet: {
        publishedAt: '2026-11-20T10:00:00Z',
        channelId: 'UC1',
        title: v.title,
        description: 'desc #foodtok',
        channelTitle: v.channel ?? 'Demo Channel',
      },
      contentDetails: { duration: 'PT45S' },
      statistics: {
        ...(v.views !== undefined && { viewCount: v.views }),
        ...(v.likes !== undefined && { likeCount: v.likes }),
        favoriteCount: '0',
        ...(v.comments !== undefined && { commentCount: v.comments }),
      },
    })),
  });
}

function adapterWith(steps: Parameters<typeof scriptedTransport>[0]) {
  const transport = scriptedTransport(steps);
  return { transport, adapter: youtubeDataAdapter({ transport, apiKey: 'k', now: () => now }) };
}

describe('YouTube Data API 어댑터', () => {
  it('검색 → 상세 조회 2단계로 받고, 문자열 통계를 숫자로, 없는 좋아요는 null로 저장한다', async () => {
    const { adapter, transport } = adapterWith([
      ok(searchBody(['vid1', 'vid2'])),
      ok(
        videosBody([
          {
            id: 'vid1',
            title: 'Spicy #challenge day 1',
            views: '3057',
            likes: '25',
            comments: '12',
          },
          { id: 'vid2', title: 'no likes', views: '10' },
        ]),
      ),
    ]);
    const body = await adapter.fetchPage(query, null);
    const parsed = adapter.parsePage(body, query);
    expect(parsed.items[0]).toMatchObject({
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=vid1',
      metrics: { views: 3057, likes: 25, comments: 12, shares: null },
      hashtags: ['challenge', 'foodtok'],
    });
    expect(parsed.items[1]?.metrics).toEqual({
      views: 10,
      likes: null,
      comments: null,
      shares: null,
    });
    expect(transport.requests[0]?.url).toContain('videoDuration=short');
    expect(transport.requests[1]?.url).toContain('id=vid1%2Cvid2');
  });

  it('검색에는 있었는데 상세 조회에서 빠진 영상은 누락 경고로 남긴다', async () => {
    const { adapter } = adapterWith([
      ok(searchBody(['a', 'b', 'c'])),
      ok(videosBody([{ id: 'a', title: 'x', views: '1' }])),
    ]);
    const parsed = adapter.parsePage(await adapter.fetchPage(query, null), query);
    expect(parsed.warnings[0]?.message).toContain('3건 중 2건');
  });

  it('쿼터 소진은 재시도하지 않는 quota_exhausted로, 키 오류는 auth로 분류한다', () => {
    const quota = classifyYouTubeError(
      403,
      JSON.stringify({
        error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] },
      }),
      undefined,
    );
    expect(quota.kind).toBe('quota_exhausted');
    expect(quota.retryable).toBe(false);
    expect(
      classifyYouTubeError(
        400,
        JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
        undefined,
      ).kind,
    ).toBe('auth');
    expect(classifyYouTubeError(503, '<html>', undefined).kind).toBe('server');
  });

  it('ISO 8601 길이를 초로 바꾼다', () => {
    expect(isoDurationSeconds('PT45S')).toBe(45);
    expect(isoDurationSeconds('PT1M5S')).toBe(65);
    expect(isoDurationSeconds('nope')).toBeNull();
  });
});

describe('YouTube 정책 준수 (Developer Policies III.E)', () => {
  async function withYouTube() {
    const db = openDatabase(':memory:');
    const { adapter } = adapterWith([
      ok(searchBody(['y1', 'y2'])),
      ok(
        videosBody([
          { id: 'y1', title: '#spicynoodlechallenge one', views: '500', channel: 'A' },
          { id: 'y2', title: '#spicynoodlechallenge two', views: '700', channel: 'B' },
        ]),
      ),
    ]);
    await runCollection(db, adapter, query, { maxPages: 1, now: () => now });
    return db;
  }

  it('소유자가 다른 YouTube 데이터를 해시태그 집계·동시출현에 합치지 않는다 (III.E.2)', async () => {
    const db = await withYouTube();
    expect(topHashtags(db)).toEqual([]);
    expect(relatedHashtags(db, 'spicynoodlechallenge')).toEqual([]);
  });

  it('YouTube 영상은 영상 단위 사실로만 관찰하고, YouTube가 준 값 그대로 쓴다', async () => {
    const db = await withYouTube();
    expect(factById(db, 'video:youtube:y2', now)?.values).toEqual({ views: 700 });
    expect(buildObservation(db, now).facts.some((f) => f.factId.startsWith('format:'))).toBe(false);
  });

  it('저장 30일이 지난 YouTube 데이터는 지운다 (III.E.4)', async () => {
    const db = await withYouTube();
    expect(purgeExpiredYouTube(db, new Date(now.getTime() + 29 * 86_400_000))).toBe(0);
    expect(purgeExpiredYouTube(db, new Date(now.getTime() + 31 * 86_400_000))).toBe(2);
  });

  it('하루 검색 횟수를 태평양 시간 자정 기준으로 세고, 한도에 닿으면 수집 제안을 막는다', () => {
    const db = openDatabase(':memory:');
    process.env.YOUTUBE_API_KEY = 'test-key';
    try {
      for (let i = 0; i < 80; i += 1) {
        const id = startRun(db, {
          adapterId: 'youtube-data',
          platform: 'youtube',
          source: 'official-api',
          query: { kind: 'keyword', value: `q${i}` },
          now,
        });
        finishRun(db, id, {
          status: 'succeeded',
          counters: {
            pagesFetched: 1,
            itemsSeen: 0,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            rejected: 0,
            retries: 0,
          },
          fieldStats: {},
          now,
        });
      }
      expect(youtubeSearchesToday(db, now)).toBe(80);
      const draft = {
        kind: 'collect_query',
        title: 'x 수집',
        rationale: '근거',
        adapterId: 'youtube-data',
        queryKind: 'keyword',
        queryValue: 'x',
        runId: null,
        plan: null,
        evidence: ['quota:instagram-hashtags'],
        claims: [],
      };
      const quota = verifyProposal(db, buildObservation(db, now), draft, now).checks.find(
        (c) => c.check === 'quota',
      );
      expect(quota).toMatchObject({ passed: false });
    } finally {
      delete process.env.YOUTUBE_API_KEY;
    }
  });

  it('태평양 시간 자정을 쿼터 초기화 시점으로 계산한다', () => {
    // 2026-11-24 03:00 UTC = 11-23 19:00 PST → 그날 0시 = 11-23 08:00 UTC
    expect(pacificDayStart(now).toISOString()).toBe('2026-11-23T08:00:00.000Z');
  });
});
