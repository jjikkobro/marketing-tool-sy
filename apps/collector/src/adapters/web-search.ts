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
 * 실제 키로 돌려 보고 알게 된 것 (2026-11-25, 0002 §9)
 * - TikTok·Instagram 결과에는 published_date가 거의 없다 (20건 중 0~2건).
 *   filter_by_published_date를 켜면 결과가 0건이 된다.
 * - time_range를 줘도 몇 년 전 게시물이 섞여 나온다. 호출마다 결과가 달라진다.
 * → 게시일은 게시물 ID에서 계산하고(postedAtFromId), 최근 30일 필터는 여기서 직접 건다.
 *   Tavily가 날짜를 준 결과와 ID에서 계산한 날짜가 같은 날로 맞는 것을 실제 응답 4건에서 확인했다.
 *   둘이 2일 넘게 다르면 ID 구조가 바뀌었을 수 있으므로 경고를 남긴다 (구조 변화 감지).
 *
 * 이 경로의 한계 (화면과 README에 그대로 쓴다)
 * - 조회수·좋아요는 없다. 지표는 모두 null(—)이다. 0으로 채우지 않는다.
 * - 검색 엔진이 색인한 게시물만 나온다. 플랫폼 전체가 아니다.
 * - ID에서 게시일을 계산하는 방식은 공식 문서에 없는 ID 구조에 기대고 있다. 그래서 위 대조 경고를 둔다.
 */
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import type { CollectQuery, Platform, SocialContent } from '../schema.ts';
import { parseRetryAfter } from './http.ts';
import {
  truncateSample,
  type PageWarning,
  type ParsedPage,
  type Rejection,
  type SourceAdapter,
  type Transport,
} from './types.ts';

const ENDPOINT = 'https://api.tavily.com/search';
const MAX_RESULTS = 20;
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const CAPTION_MAX = 500;
/** 최근 게시물 기준. Tavily의 time_range가 믿을 만하게 걸러 주지 않아 직접 건다 */
export const SEARCH_WINDOW_DAYS = 30;
/** Tavily가 준 날짜와 ID에서 계산한 날짜가 이보다 많이 다르면 경고한다 */
const DATE_MISMATCH_MS = 2 * 86_400_000;
/** Instagram 미디어 ID의 시간 기준점 (2011-08-24, ID 상위 비트 = 이 시점부터의 ms) */
const INSTAGRAM_EPOCH_MS = 1_314_220_021_721;
const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** 이보다 이른 시각이 나오면 ID 구조가 예상과 다른 것으로 본다 */
const EARLIEST_PLAUSIBLE = Date.UTC(2016, 0, 1);

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

/**
 * 게시물 ID에 들어 있는 생성 시각을 꺼낸다.
 * - TikTok 영상 ID: 상위 32비트가 유닉스 초
 * - Instagram 단축 코드: 64진수로 미디어 ID를 쓴 것. 미디어 ID의 23비트 위가 INSTAGRAM_EPOCH_MS 이후 ms
 * 계산 결과가 말이 안 되면(2016년 이전, 미래) null을 돌려준다. 날짜를 지어내지 않는다.
 */
export function postedAtFromId(platform: SearchPlatform, id: string, now: Date): Date | null {
  let ms: number;
  if (platform === 'tiktok') {
    if (!/^\d{15,20}$/.test(id)) return null;
    ms = Number(BigInt(id) >> 32n) * 1000;
  } else {
    // 비공개 게시물 등에서 보이는 긴 코드는 앞 11자가 미디어 ID다
    const code = id.slice(0, 11);
    let value = 0n;
    for (const char of code) {
      const digit = SHORTCODE_ALPHABET.indexOf(char);
      if (digit < 0) return null;
      value = value * 64n + BigInt(digit);
    }
    ms = Number(value >> 23n) + INSTAGRAM_EPOCH_MS;
  }
  return ms < EARLIEST_PLAUSIBLE || ms > now.getTime() + 86_400_000 ? null : new Date(ms);
}

/**
 * 검색 결과의 본문(content)이 게시물 설명이 아니라 페이지 메뉴 글자인 경우가 있다
 * (실제 TikTok 결과: "TikTok - Make Your Day … Log in … For You …"). 그럴 때는 제목을 캡션으로 쓴다.
 * 레퍼런스 기반 기획에서 Claude가 "본문이 페이지 텍스트뿐"이라며 근거로 쓰지 못한 사례가 있었다 (0002 §12).
 */
const PAGE_CHROME =
  /make your day|log in|sign up|for you\s+(explore|following)|terms\s*&\s*policies/i;

export function pickCaption(title: string | undefined, content: string | undefined): string {
  const body = content?.trim() ?? '';
  const heading = title?.trim() ?? '';
  if (body && !PAGE_CHROME.test(body)) return body;
  return heading || body;
}

export function webSearchAdapter(options: {
  transport: Transport;
  apiKey: string;
  platform: SearchPlatform;
  now?: () => Date;
}): SourceAdapter {
  const { platform } = options;
  const now = options.now ?? (() => new Date());

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
          // 최근 게시물 쪽으로 기울이는 용도. 실제 기간 필터는 parsePage에서 ID 날짜로 건다
          time_range: 'week',
          // 날짜가 오면 ID에서 계산한 날짜와 대조한다. filter_by_published_date는 결과를 비워서 쓰지 않는다
          include_published_date: true,
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
      const skipped: Rejection[] = [];
      const warnings: PageWarning[] = [];
      const current = now();
      const since = current.getTime() - SEARCH_WINDOW_DAYS * 86_400_000;
      let mismatched = 0;

      for (const result of parsed.data.results) {
        const post = parsePostUrl(platform, result.url);
        if (!post) {
          skipped.push({ reason: '게시물 URL이 아님', sample: truncateSample(result.url) });
          continue;
        }
        const published = postedAtFromId(platform, post.id, current);
        if (!published) {
          rejected.push({
            reason: 'ID에서 게시일을 계산하지 못함',
            sample: truncateSample(result.url),
          });
          continue;
        }
        const reported = result.published_date ? new Date(result.published_date) : null;
        if (
          reported &&
          !Number.isNaN(reported.getTime()) &&
          Math.abs(reported.getTime() - published.getTime()) > DATE_MISMATCH_MS
        ) {
          mismatched += 1;
        }
        if (published.getTime() < since) {
          skipped.push({
            reason: `최근 ${SEARCH_WINDOW_DAYS}일보다 오래됨`,
            sample: truncateSample(result.url),
          });
          continue;
        }
        const text = [result.title, result.content].filter(Boolean).join('\n');
        items.push({
          platform,
          platformContentId: post.id,
          url: post.url,
          creatorHandle: post.creator,
          caption: pickCaption(result.title, result.content).slice(0, CAPTION_MAX),
          hashtags: [
            ...new Set([...text.matchAll(HASHTAG_PATTERN)].map((m) => (m[1] ?? '').toLowerCase())),
          ],
          mediaType: post.mediaType,
          publishedAt: published.toISOString(),
          // 검색 결과에는 지표가 없다. 0이 아니라 "수집 못 함"이다.
          metrics: { views: null, likes: null, comments: null, shares: null },
        });
      }
      if (mismatched > 0) {
        warnings.push({
          kind: 'schema_drift',
          message: `검색 결과 ${mismatched}건에서 ID로 계산한 게시일과 검색 API의 게시일이 2일 넘게 다릅니다 (ID 구조 변화 의심)`,
        });
      }
      return { items, rejected, skipped, warnings, nextCursor: null };
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
