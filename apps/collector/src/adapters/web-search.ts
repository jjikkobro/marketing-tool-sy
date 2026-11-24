/**
 * 검색 API 어댑터: TikTok·Instagram 공식 API 대신 웹 검색으로 최근 공개 게시물 URL을 찾는다 (docs/decisions/0006)
 *
 * 왜 검색 API인가
 * - TikTok Research API는 연구 기관 승인이, Instagram Graph API는 비즈니스 계정·Meta 앱 심사가 필요하다.
 *   지원자 개인이 당장 쓸 수 없어 공식 어댑터는 "토큰이 생기면 켜는" 상태로 두었다.
 * - Google Custom Search JSON API는 신규 고객을 받지 않는다 (2026-11 확인). 그래서 같은 역할(site: 검색)을
 *   하는 Tavily Search API를 쓴다. include_domains가 `site:tiktok.com`과 같은 역할을 한다.
 *
 * Tavily 문서에서 확인한 것 (https://docs.tavily.com/documentation/api-reference/endpoint/search, 2026-11-24)
 * - POST https://api.tavily.com/search, Authorization: Bearer <키>
 * - include_domains(도메인 제한, 기본 restrict), time_range(day·week·month·year), max_results(0~20),
 *   include_published_date·filter_by_published_date(베타), basic 검색은 1크레딧
 * - 응답 results[]: title, url, content(짧은 설명), score, published_date("Tue, 11 Mar 2025 17:00:00 GMT" 형식, null 가능)
 * - 오류: 401 키 오류, 429 요청 한도(Retry-After), 432 키·요금제 한도, 433 종량제 한도, 434 일시적 용량 부족
 *
 * 이 경로의 한계 (화면과 README에 그대로 쓴다)
 * - 조회수·좋아요는 없다. 지표는 모두 null(—)이다. 0으로 채우지 않는다.
 * - 검색 엔진이 색인한 게시물만 나온다. 플랫폼 전체가 아니다.
 * - 게시일이 없는 결과는 날짜를 지어내지 않고 버린다 (거부 사유로 기록).
 */
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import type { CollectQuery, Platform, SocialContent } from '../schema.ts';
import { parseRetryAfter } from './http.ts';
import {
  truncateSample,
  type ParsedPage,
  type Rejection,
  type SourceAdapter,
  type Transport,
} from './types.ts';

const ENDPOINT = 'https://api.tavily.com/search';
const MAX_RESULTS = 20;
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const CAPTION_MAX = 500;

export type SearchPlatform = Extract<Platform, 'tiktok' | 'instagram'>;

const DOMAIN: Record<SearchPlatform, string> = {
  tiktok: 'tiktok.com',
  instagram: 'instagram.com',
};

export const SEARCH_ADAPTER_ID: Record<SearchPlatform, string> = {
  tiktok: 'search-tiktok',
  instagram: 'search-instagram',
};

const responseSchema = z.object({
  results: z
    .array(
      z.looseObject({
        url: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        // 문서: include_published_date일 때만 오고, 날짜를 모르면 null. 예시 형식은 RFC 1123
        published_date: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

interface PostRef {
  id: string;
  url: string;
  creator: string | null;
  mediaType: SocialContent['mediaType'];
}

/**
 * 게시물 URL만 받아들인다. 프로필·해시태그·검색 페이지는 게시물이 아니므로 버린다.
 * ID는 플랫폼 고유 값(TikTok 영상 ID, Instagram 단축 코드)이라 같은 게시물이 다시 나오면 중복으로 합쳐진다.
 */
export function parsePostUrl(platform: SearchPlatform, raw: string): PostRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const domain = DOMAIN[platform];
  if (host !== domain && !host.endsWith(`.${domain}`)) return null;

  if (platform === 'tiktok') {
    const match = /^\/@([\w.-]+)\/(video|photo)\/(\d+)/.exec(url.pathname);
    if (!match) return null;
    const [, user = '', kind, id = ''] = match;
    return {
      id,
      url: `https://www.tiktok.com/@${user}/${kind}/${id}`,
      creator: user,
      mediaType: kind === 'photo' ? 'image' : 'video',
    };
  }

  // /p/CODE, /reel/CODE, /reels/CODE, /tv/CODE, /<user>/p/CODE, /<user>/reel/CODE
  const match = /^\/(?:([\w.]+)\/)?(p|reels?|tv)\/([\w-]+)/.exec(url.pathname);
  if (!match) return null;
  const [, user, kind = 'p', code = ''] = match;
  const path = kind === 'p' ? 'p' : 'reel';
  return {
    id: code,
    url: `https://www.instagram.com/${path}/${code}/`,
    creator: user ?? null,
    mediaType: kind === 'p' ? 'unknown' : 'video',
  };
}

export function webSearchAdapter(options: {
  transport: Transport;
  apiKey: string;
  platform: SearchPlatform;
}): SourceAdapter {
  const { platform } = options;

  return {
    id: SEARCH_ADAPTER_ID[platform],
    platform,
    source: 'web-search',

    async fetchPage(query: CollectQuery): Promise<string> {
      const response = await options.transport({
        method: 'POST',
        url: ENDPOINT,
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: {
          query: query.kind === 'hashtag' ? `#${query.value}` : query.value,
          include_domains: [DOMAIN[platform]],
          time_range: 'week',
          // 게시일 추정값을 받고, 기간 밖이거나 게시일을 모르는 결과는 Tavily에서 먼저 뺀다
          include_published_date: true,
          filter_by_published_date: true,
          max_results: MAX_RESULTS,
          search_depth: 'basic',
        },
      });
      if (response.status !== 200) {
        throw classifySearchError(response.status, response.text, response.headers['retry-after']);
      }
      return response.text;
    },

    parsePage(body: string): ParsedPage {
      const parsed = responseSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        throw new CollectorError(
          'invalid_response',
          `검색 응답 구조가 문서와 다릅니다: ${parsed.error.message}`,
        );
      }
      const items: SocialContent[] = [];
      const rejected: Rejection[] = [];

      for (const result of parsed.data.results) {
        const post = parsePostUrl(platform, result.url);
        if (!post) {
          rejected.push({ reason: '게시물 URL이 아님', sample: truncateSample(result.url) });
          continue;
        }
        const published = result.published_date ? new Date(result.published_date) : null;
        if (!published || Number.isNaN(published.getTime())) {
          rejected.push({ reason: '게시일 없음', sample: truncateSample(result.url) });
          continue;
        }
        const text = [result.title, result.content].filter(Boolean).join('\n');
        items.push({
          platform,
          platformContentId: post.id,
          url: post.url,
          creatorHandle: post.creator,
          caption: (result.content?.trim() || result.title?.trim() || '').slice(0, CAPTION_MAX),
          hashtags: [
            ...new Set([...text.matchAll(HASHTAG_PATTERN)].map((m) => (m[1] ?? '').toLowerCase())),
          ],
          mediaType: post.mediaType,
          publishedAt: published.toISOString(),
          // 검색 결과에는 지표가 없다. 0이 아니라 "수집 못 함"이다.
          metrics: { views: null, likes: null, comments: null, shares: null },
        });
      }
      return { items, rejected, warnings: [], nextCursor: null };
    },
  };
}

const errorSchema = z.object({
  detail: z.union([z.string(), z.looseObject({ error: z.string().optional() })]).optional(),
});

/**
 * Tavily 오류 응답 분류. 본문 형식은 문서로 확인하지 못해 상태 코드를 우선한다.
 * 432·433은 Tavily 문서의 "요금제·사용량 한도 초과"다. 기다려도 풀리지 않으므로 재시도하지 않는다.
 */
export function classifySearchError(
  status: number,
  text: string,
  retryAfter: string | undefined,
): CollectorError {
  let detail = String(status);
  try {
    const parsed = errorSchema.safeParse(JSON.parse(text));
    const value = parsed.success ? parsed.data.detail : undefined;
    const message = typeof value === 'string' ? value : value?.error;
    if (message) detail = `${status} ${message}`;
  } catch {
    // JSON이 아닌 본문(게이트웨이 HTML 등)은 상태 코드로만 판단한다
  }
  const options = { httpStatus: status, retryAfterMs: parseRetryAfter(retryAfter) };
  if (status === 432 || status === 433)
    return new CollectorError('quota_exhausted', `검색 API 사용량 한도: ${detail}`, options);
  if (status === 429 || status === 434)
    return new CollectorError('rate_limited', `검색 API 요청 한도: ${detail}`, options);
  if (status === 401 || status === 403)
    return new CollectorError('auth', `검색 API 인증 오류: ${detail}`, options);
  if (status >= 500) return new CollectorError('server', `검색 API 서버 오류: ${detail}`, options);
  return new CollectorError('invalid_response', `검색 API 요청 거부: ${detail}`, options);
}
