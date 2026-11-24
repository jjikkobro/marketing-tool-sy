/**
 * TikTok Research API — Query Videos 어댑터
 * 문서: https://developers.tiktok.com/doc/research-api-specs-query-videos (2026-09-01 갱신본 기준)
 *
 * 문서에서 확인한 제약
 * - POST /v2/research/video/query/, 응답은 { data: { videos, cursor, has_more, search_id }, error: { code, message, log_id } }
 * - start_date와 end_date는 YYYYMMDD(UTC) 형식이고, 기간은 30일 이내여야 한다
 * - max_count는 최대 100. 기본값은 spec 페이지에 20, getting-started 페이지에 10으로 서로 다르게 적혀 있어서 항상 명시한다
 * - 하루 1,000회 요청 제한 (research-api-faq 7번), UTC 자정에 초기화
 * - 필드 표에는 영상 ID가 `id`로, 응답 예시에는 `video_id`로 적혀 있다. 둘 다 받고, 어느 쪽이 왔는지 경고로 남긴다
 * - 429 처리 방식은 문서에 없다. HTTP 표준 의미대로 재시도 대상으로 본다
 */
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import { toMetric } from '../core/metrics.ts';
import type { CollectQuery, SocialContent } from '../schema.ts';
import { parseJsonPreservingIds, parseRetryAfter } from './http.ts';
import {
  truncateSample,
  type PageWarning,
  type ParsedPage,
  type Rejection,
  type SourceAdapter,
  type Transport,
} from './types.ts';

const ENDPOINT = 'https://open.tiktokapis.com/v2/research/video/query/';
const FIELDS = [
  'id',
  'video_description',
  'create_time',
  'username',
  'hashtag_names',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
] as const;
const PAGE_SIZE = 100;
const WINDOW_DAYS = 7;

const videoSchema = z.looseObject({
  id: z.string().optional(),
  video_id: z.string().optional(),
  video_description: z.string().optional(),
  create_time: z.number().int().optional(),
  username: z.string().optional(),
  hashtag_names: z.array(z.string()).optional(),
  view_count: z.unknown().optional(),
  like_count: z.unknown().optional(),
  comment_count: z.unknown().optional(),
  share_count: z.unknown().optional(),
});

const responseSchema = z.object({
  data: z
    .object({
      videos: z.array(z.unknown()).default([]),
      cursor: z.union([z.number(), z.string()]).optional(),
      has_more: z.boolean().default(false),
      search_id: z.string().optional(),
    })
    .optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).optional(),
});

/** 우리 쪽 커서는 TikTok의 cursor와 search_id를 함께 담는다. 다음 페이지를 같은 검색 결과에서 이어 받아야 하기 때문이다. */
const cursorSchema = z.object({ cursor: z.string(), searchId: z.string() });

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function tiktokResearchAdapter(options: {
  transport: Transport;
  accessToken: string;
  now?: () => Date;
}): SourceAdapter {
  const now = options.now ?? (() => new Date());

  return {
    id: 'tiktok-research',
    platform: 'tiktok',
    source: 'official-api',

    async fetchPage(query: CollectQuery, cursor: string | null): Promise<string> {
      const end = now();
      const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
      const page = cursor ? cursorSchema.parse(JSON.parse(cursor)) : null;

      const response = await options.transport({
        method: 'POST',
        url: `${ENDPOINT}?fields=${FIELDS.join(',')}`,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: {
          query: {
            and: [
              {
                field_name: query.kind === 'hashtag' ? 'hashtag_name' : 'keyword',
                operation: 'EQ',
                field_values: [query.value],
              },
            ],
          },
          start_date: yyyymmdd(start),
          end_date: yyyymmdd(end),
          max_count: PAGE_SIZE,
          ...(page && { cursor: Number(page.cursor), search_id: page.searchId }),
        },
      });

      if (response.status === 200) return response.text;
      throw classifyTikTokError(response.status, response.text, response.headers['retry-after']);
    },

    parsePage(body: string): ParsedPage {
      const parsed = responseSchema.safeParse(parseJsonPreservingIds(body, ['id', 'video_id']));
      if (!parsed.success) {
        throw new CollectorError(
          'invalid_response',
          `응답 구조가 문서와 다릅니다: ${parsed.error.message}`,
        );
      }
      if (parsed.data.error && parsed.data.error.code !== 'ok') {
        throw new CollectorError('invalid_response', `API 오류: ${parsed.data.error.code}`);
      }

      const data = parsed.data.data;
      const items: SocialContent[] = [];
      const rejected: Rejection[] = [];
      let usedVideoIdAlias = false;

      for (const raw of data?.videos ?? []) {
        const video = videoSchema.safeParse(raw);
        if (!video.success) {
          rejected.push({ reason: '영상 객체 형식 오류', sample: truncateSample(raw) });
          continue;
        }
        const v = video.data;
        const id = v.id ?? v.video_id;
        if (!v.id && v.video_id) usedVideoIdAlias = true;
        if (!id || v.create_time === undefined) {
          rejected.push({ reason: 'id 또는 create_time 없음', sample: truncateSample(raw) });
          continue;
        }
        items.push({
          platform: 'tiktok',
          platformContentId: id,
          url: v.username ? `https://www.tiktok.com/@${v.username}/video/${id}` : null,
          creatorHandle: v.username ?? null,
          caption: v.video_description ?? '',
          hashtags: (v.hashtag_names ?? []).map((tag) => tag.toLowerCase()),
          mediaType: 'video',
          publishedAt: new Date(v.create_time * 1000).toISOString(),
          metrics: {
            views: toMetric(v.view_count),
            likes: toMetric(v.like_count),
            comments: toMetric(v.comment_count),
            shares: toMetric(v.share_count),
          },
        });
      }

      const warnings: PageWarning[] = usedVideoIdAlias
        ? [
            {
              kind: 'schema_drift',
              message: '영상 ID가 문서 필드 표의 `id`가 아니라 `video_id`로 왔습니다',
            },
          ]
        : [];

      const nextCursor =
        data?.has_more && data.cursor !== undefined && data.search_id
          ? JSON.stringify({ cursor: String(data.cursor), searchId: data.search_id })
          : null;

      return { items, rejected, warnings, nextCursor };
    },
  };
}

export function classifyTikTokError(
  status: number,
  text: string,
  retryAfter: string | undefined,
): CollectorError {
  let code = '';
  try {
    code = responseSchema.parse(JSON.parse(text)).error?.code ?? '';
  } catch {
    // 오류 본문이 JSON이 아닐 수 있다 (게이트웨이 HTML 등). 상태 코드로만 판단한다.
  }
  const options = { httpStatus: status, retryAfterMs: parseRetryAfter(retryAfter) };
  if (status === 401 || code === 'access_token_invalid' || code === 'scope_not_authorized') {
    return new CollectorError(
      'auth',
      `인증 실패 (${code || status}). 토큰은 2시간마다 만료됩니다`,
      options,
    );
  }
  if (status === 429) return new CollectorError('rate_limited', '요청 한도 초과 (429)', options);
  if (status >= 500) return new CollectorError('server', `서버 오류 (${status})`, options);
  return new CollectorError('invalid_response', `요청 거부 (${status} ${code})`, options);
}
