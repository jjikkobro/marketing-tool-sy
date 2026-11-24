/**
 * Instagram Graph API — 해시태그 최근 게시물 어댑터
 * 문서
 * - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search
 * - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media
 * - https://developers.facebook.com/docs/graph-api/guides/error-handling
 *
 * 문서에서 확인한 제약
 * - 해시태그 검색으로 ID를 얻은 뒤 /{hashtag-id}/recent_media를 조회한다 (키워드 검색은 지원하지 않는다)
 * - 7일 동안 고유 해시태그 30개까지만 조회할 수 있다. recent_media 조회도 1회로 센다
 * - 최근 24시간 게시물만, 페이지당 최대 50개
 * - username은 요청할 수 없다. 그래서 creatorHandle은 항상 null이다
 * - 소유자가 좋아요를 숨기면 like_count가 응답에서 빠진다. 0이 아니라 null로 기록한다
 * - after 커서는 모든 페이지에서 같은 값이라 커서로 진행 여부를 판단할 수 없다. 그래서 paging.next URL을 그대로 따라간다
 * - 요청 한도 초과는 HTTP 429가 아니라 400/403 + error.code(4, 17, 32, 613)로 온다
 */
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import { canonicalUrl } from '../core/identity.ts';
import { toMetric } from '../core/metrics.ts';
import type { CollectQuery, SocialContent } from '../schema.ts';
import { parseJsonPreservingIds, parseRetryAfter } from './http.ts';
import {
  truncateSample,
  type ParsedPage,
  type Rejection,
  type SourceAdapter,
  type Transport,
} from './types.ts';

const GRAPH = 'https://graph.facebook.com/v27.0';
const FIELDS = 'id,caption,media_type,permalink,timestamp,like_count,comments_count';
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;

/*
 * 지표 필드는 반드시 optional로 둔다. zod v4에서 z.unknown()만 쓰면 키가 없을 때 검증에 실패한다.
 * 그러면 좋아요를 숨긴 게시물이 null로 저장되지 않고 통째로 버려진다 (데모 실행에서 발견, docs/decisions/0002).
 */
const mediaSchema = z.looseObject({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']).optional(),
  permalink: z.string().optional(),
  /* 문서 표에는 Unix timestamp로, 실제 Graph 응답 관례는 ISO 8601이다. 둘 다 받는다. */
  timestamp: z.union([z.string(), z.number()]),
  like_count: z.unknown().optional(),
  comments_count: z.unknown().optional(),
});

const pageSchema = z.object({
  data: z.array(z.unknown()),
  paging: z.object({ next: z.string().url().optional() }).optional(),
});

const searchSchema = z.object({ data: z.array(z.object({ id: z.string() })).min(1) });

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
    error_subcode: z.number().optional(),
  }),
});

const MEDIA_TYPE = { IMAGE: 'image', VIDEO: 'video', CAROUSEL_ALBUM: 'carousel' } as const;

function toIso(timestamp: string | number): string | null {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function instagramGraphAdapter(options: {
  transport: Transport;
  accessToken: string;
  igUserId: string;
}): SourceAdapter {
  /* 해시태그 ID는 전역에서 고정된 값이라(문서 명시) 한 번만 조회한다. 7일 30개 제한을 아끼기 위해서다. */
  const hashtagIds = new Map<string, string>();

  async function request(url: string): Promise<string> {
    const response = await options.transport({ method: 'GET', url });
    if (response.status === 200) return response.text;
    throw classifyGraphError(response.status, response.text, response.headers['retry-after']);
  }

  async function resolveHashtagId(tag: string): Promise<string> {
    const cached = hashtagIds.get(tag);
    if (cached) return cached;
    const params = new URLSearchParams({
      user_id: options.igUserId,
      q: tag,
      access_token: options.accessToken,
    });
    const body = searchSchema.safeParse(
      parseJsonPreservingIds(await request(`${GRAPH}/ig_hashtag_search?${params}`), ['id']),
    );
    if (!body.success)
      throw new CollectorError('invalid_response', `해시태그를 찾을 수 없습니다: #${tag}`);
    const id = body.data.data[0]?.id;
    if (!id) throw new CollectorError('invalid_response', `해시태그를 찾을 수 없습니다: #${tag}`);
    hashtagIds.set(tag, id);
    return id;
  }

  return {
    id: 'instagram-graph',
    platform: 'instagram',
    source: 'official-api',

    async fetchPage(query: CollectQuery, cursor: string | null): Promise<string> {
      if (cursor) return request(cursor);
      if (query.kind !== 'hashtag') {
        throw new CollectorError(
          'invalid_response',
          'Instagram Graph API는 해시태그 검색만 지원합니다',
        );
      }
      const hashtagId = await resolveHashtagId(query.value.replace(/^#/, '').toLowerCase());
      const params = new URLSearchParams({
        user_id: options.igUserId,
        fields: FIELDS,
        limit: '50',
        access_token: options.accessToken,
      });
      return request(`${GRAPH}/${hashtagId}/recent_media?${params}`);
    },

    parsePage(body: string): ParsedPage {
      const page = pageSchema.safeParse(parseJsonPreservingIds(body, ['id']));
      if (!page.success) {
        throw new CollectorError(
          'invalid_response',
          `응답 구조가 문서와 다릅니다: ${page.error.message}`,
        );
      }

      const items: SocialContent[] = [];
      const rejected: Rejection[] = [];
      for (const raw of page.data.data) {
        const media = mediaSchema.safeParse(raw);
        const publishedAt = media.success ? toIso(media.data.timestamp) : null;
        if (!media.success || !publishedAt) {
          rejected.push({ reason: '게시물 형식 오류', sample: truncateSample(raw) });
          continue;
        }
        const m = media.data;
        const caption = m.caption ?? '';
        items.push({
          platform: 'instagram',
          platformContentId: m.id,
          url: canonicalUrl(m.permalink),
          creatorHandle: null,
          caption,
          hashtags: [...caption.matchAll(HASHTAG_PATTERN)].map((match) =>
            (match[1] ?? '').toLowerCase(),
          ),
          mediaType: m.media_type ? MEDIA_TYPE[m.media_type] : 'unknown',
          publishedAt,
          metrics: {
            views: null,
            likes: toMetric(m.like_count),
            comments: toMetric(m.comments_count),
            shares: null,
          },
        });
      }

      return { items, rejected, warnings: [], nextCursor: page.data.paging?.next ?? null };
    },
  };
}

export function classifyGraphError(
  status: number,
  text: string,
  retryAfter: string | undefined,
): CollectorError {
  const parsed = (() => {
    try {
      return errorSchema.safeParse(JSON.parse(text));
    } catch {
      return null;
    }
  })();
  const options = { httpStatus: status, retryAfterMs: parseRetryAfter(retryAfter) };
  if (!parsed?.success) {
    return status >= 500
      ? new CollectorError('server', `서버 오류 (${status})`, options)
      : new CollectorError('invalid_response', `알 수 없는 오류 응답 (${status})`, options);
  }
  const { code, message } = parsed.data.error;
  if (code === 190)
    return new CollectorError('auth', `액세스 토큰 만료 (190): ${message}`, options);
  if (RATE_LIMIT_CODES.has(code)) {
    return new CollectorError('rate_limited', `호출 한도 초과 (${code}): ${message}`, options);
  }
  if (code === 1 || code === 2 || status >= 500) {
    return new CollectorError('server', `일시적 서버 오류 (${code})`, options);
  }
  return new CollectorError('invalid_response', `요청 거부 (${code}): ${message}`, options);
}
