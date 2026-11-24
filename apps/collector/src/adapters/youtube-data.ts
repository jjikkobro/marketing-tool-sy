/**
 * YouTube Data API v3 어댑터 — 이 저장소에서 유일하게 실제 데이터를 수집하는 경로
 *
 * 문서에서 확인한 것 (2026-11-24)
 * - search.list: https://developers.google.com/youtube/v3/docs/search/list
 *   하루 100회의 별도 쿼터 버킷. maxResults 0~50. videoDuration=short는 "4분 미만"이라 Shorts만 고르지는 못한다.
 *   응답 항목에 publishTime 필드는 없다 (snippet.publishedAt만 쓴다).
 * - videos.list: https://developers.google.com/youtube/v3/docs/videos/list — 1단위. 통계 값은 문자열("3057")이다.
 *   likeCount·commentCount가 빠지는 조건은 문서에 없으므로 없을 수 있다고 보고 null로 둔다.
 * - 쿼터는 태평양 시간 자정에 초기화된다: https://developers.google.com/youtube/v3/determine_quota_cost
 *
 * 문서로 확인하지 못한 것: 오류 응답의 JSON 형식. Google API 공통 형식({ error: { code, message, errors[].reason } })을
 * 가정하고, 모르는 형식이면 HTTP 상태로만 분류한다.
 *
 * 약관(Developer Policies III.E) 대응은 core/youtube-policy.ts에 있다.
 */
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import { toMetric } from '../core/metrics.ts';
import type { CollectQuery, SocialContent } from '../schema.ts';
import { parseRetryAfter } from './http.ts';
import {
  truncateSample,
  type ParsedPage,
  type PageWarning,
  type SourceAdapter,
  type Transport,
} from './types.ts';

const API = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 25;
const WINDOW_DAYS = 30;
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;

const searchSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })).default([]),
});

const videoSchema = z.looseObject({
  id: z.string(),
  snippet: z.looseObject({
    publishedAt: z.string(),
    title: z.string(),
    description: z.string().optional(),
    channelTitle: z.string().optional(),
  }),
  statistics: z
    .looseObject({
      viewCount: z.unknown().optional(),
      likeCount: z.unknown().optional(),
      commentCount: z.unknown().optional(),
    })
    .optional(),
  contentDetails: z.looseObject({ duration: z.string().optional() }).optional(),
});

const pageSchema = z.object({
  search: searchSchema,
  videos: z.object({ items: z.array(z.unknown()).default([]) }),
});

/** "PT1M5S" → 65. 형식이 다르면 null */
export function isoDurationSeconds(value: string | undefined): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? '');
  if (!match || value === 'P' || value === 'PT') return null;
  const [, d = '0', h = '0', m = '0', s = '0'] = match;
  return Number(d) * 86_400 + Number(h) * 3_600 + Number(m) * 60 + Number(s);
}

export function youtubeDataAdapter(options: {
  transport: Transport;
  apiKey: string;
  now?: () => Date;
}): SourceAdapter {
  const now = options.now ?? (() => new Date());

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${API}/${path}?${new URLSearchParams({ ...params, key: options.apiKey })}`;
    const response = await options.transport({ method: 'GET', url });
    if (response.status !== 200) {
      throw classifyYouTubeError(response.status, response.text, response.headers['retry-after']);
    }
    return JSON.parse(response.text);
  }

  return {
    id: 'youtube-data',
    platform: 'youtube',
    source: 'official-api',

    async fetchPage(query: CollectQuery, cursor: string | null): Promise<string> {
      const since = new Date(now().getTime() - WINDOW_DAYS * 86_400_000).toISOString();
      const search = searchSchema.parse(
        await get('search', {
          part: 'snippet',
          type: 'video',
          videoDuration: 'short',
          q: query.kind === 'hashtag' ? `#${query.value}` : query.value,
          maxResults: String(PAGE_SIZE),
          publishedAfter: since,
          regionCode: 'US',
          relevanceLanguage: 'en',
          ...(cursor && { pageToken: cursor }),
        }),
      );
      const ids = search.items.flatMap((item) => (item.id.videoId ? [item.id.videoId] : []));
      const videos =
        ids.length === 0
          ? { items: [] }
          : await get('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
      return JSON.stringify({ search, videos });
    },

    parsePage(body: string): ParsedPage {
      const page = pageSchema.safeParse(JSON.parse(body));
      if (!page.success) {
        throw new CollectorError(
          'invalid_response',
          `응답 구조가 문서와 다릅니다: ${page.error.message}`,
        );
      }
      const requested = page.data.search.items.flatMap((item) =>
        item.id.videoId ? [item.id.videoId] : [],
      );
      const items: SocialContent[] = [];
      const rejected: ParsedPage['rejected'] = [];

      for (const raw of page.data.videos.items) {
        const video = videoSchema.safeParse(raw);
        const publishedAt = video.success ? new Date(video.data.snippet.publishedAt) : null;
        if (!video.success || !publishedAt || Number.isNaN(publishedAt.getTime())) {
          rejected.push({ reason: '영상 형식 오류', sample: truncateSample(raw) });
          continue;
        }
        const v = video.data;
        const text = `${v.snippet.title}\n${v.snippet.description ?? ''}`;
        items.push({
          platform: 'youtube',
          platformContentId: v.id,
          // YouTube 정책: API 데이터의 링크를 제거·변경하지 않는다 (III.I.4). 원본 영상으로 바로 연결한다.
          url: `https://www.youtube.com/watch?v=${v.id}`,
          creatorHandle: v.snippet.channelTitle ?? null,
          caption: v.snippet.title,
          hashtags: [
            ...new Set([...text.matchAll(HASHTAG_PATTERN)].map((m) => (m[1] ?? '').toLowerCase())),
          ],
          mediaType: 'video',
          publishedAt: publishedAt.toISOString(),
          metrics: {
            views: toMetric(v.statistics?.viewCount),
            likes: toMetric(v.statistics?.likeCount),
            comments: toMetric(v.statistics?.commentCount),
            shares: null,
          },
        });
      }

      const returned = new Set(items.map((item) => item.platformContentId));
      const missing = requested.filter((id) => !returned.has(id));
      const warnings: PageWarning[] =
        missing.length > 0
          ? [
              {
                kind: 'invalid_response',
                message: `검색 결과 ${requested.length}건 중 ${missing.length}건이 상세 조회에서 빠졌습니다 (삭제·비공개 추정)`,
              },
            ]
          : [];

      return { items, rejected, warnings, nextCursor: page.data.search.nextPageToken ?? null };
    },
  };
}

const errorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export function classifyYouTubeError(
  status: number,
  text: string,
  retryAfter: string | undefined,
): CollectorError {
  let reasons: string[] = [];
  let message = '';
  try {
    const parsed = errorSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      reasons = (parsed.data.error.errors ?? []).flatMap((e) => (e.reason ? [e.reason] : []));
      message = parsed.data.error.message ?? '';
    }
  } catch {
    // JSON이 아닌 오류 본문(게이트웨이 HTML 등)은 상태 코드로만 판단한다
  }
  const options = { httpStatus: status, retryAfterMs: parseRetryAfter(retryAfter) };
  const detail = [reasons.join(','), message].filter(Boolean).join(' ') || String(status);

  // 하루 쿼터 소진: 재시도해도 초기화(태평양 시간 자정) 전까지 실패하고, 실패한 요청도 쿼터를 쓴다
  if (reasons.includes('quotaExceeded')) {
    return new CollectorError('quota_exhausted', `YouTube 하루 쿼터 소진: ${detail}`, options);
  }
  if (status === 429 || reasons.some((r) => /rateLimit/i.test(r))) {
    return new CollectorError('rate_limited', `YouTube 요청 한도: ${detail}`, options);
  }
  if (
    status === 401 ||
    status === 403 ||
    reasons.includes('keyInvalid') ||
    /API key not valid/i.test(message)
  ) {
    return new CollectorError('auth', `YouTube 인증·권한 오류: ${detail}`, options);
  }
  if (status >= 500) return new CollectorError('server', `YouTube 서버 오류: ${detail}`, options);
  return new CollectorError('invalid_response', `YouTube 요청 거부: ${detail}`, options);
}
