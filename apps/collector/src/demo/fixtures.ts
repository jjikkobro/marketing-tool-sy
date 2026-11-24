/**
 * 녹화 응답(픽스처) 생성기.
 *
 * 응답 구조는 공식 문서 예시를 그대로 따르고, 값은 모두 가상이다.
 * - TikTok: https://developers.tiktok.com/doc/research-api-specs-query-videos
 * - Instagram: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media
 * - Graph 오류: https://developers.facebook.com/docs/graph-api/guides/error-handling
 *
 * 내가 만든 데이터를 내 파서가 통과시키는 순환 검증이 되지 않도록, 필드 이름과 중첩 구조는 문서에서 가져오고
 * 문서끼리 어긋나는 곳(id와 video_id)도 그대로 재현한다.
 */
import type { HttpRequest, HttpResponse, Transport } from '../adapters/types.ts';

const HOUR = 3_600_000;

/** 순서대로 응답하는 가짜 전송 계층. 보낸 요청은 테스트에서 검사할 수 있게 쌓아 둔다. */
export function scriptedTransport(
  steps: Array<HttpResponse | ((request: HttpRequest) => HttpResponse)>,
): Transport & { requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const transport = async (request: HttpRequest): Promise<HttpResponse> => {
    requests.push(request);
    const step = steps[requests.length - 1];
    if (!step)
      throw new Error(`준비된 응답이 없습니다 (${requests.length}번째 요청: ${request.url})`);
    return typeof step === 'function' ? step(request) : step;
  };
  return Object.assign(transport, { requests });
}

export function ok(text: string): HttpResponse {
  return { status: 200, headers: { 'content-type': 'application/json' }, text };
}

export function httpError(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    text: JSON.stringify(body),
  };
}

/* ── TikTok Research API ─────────────────────────────────────────── */

export interface TikTokVideoSeed {
  /** 2^53을 넘는 int64. 문서 예시처럼 따옴표 없이 직렬화된다. null이면 ID 필드를 뺀다. */
  id: string | null;
  username?: string;
  description: string;
  hashtags: string[];
  hoursAgo: number;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

/** int64 ID를 문서처럼 따옴표 없는 숫자로 내보낸다. JSON.stringify로는 표현할 수 없어서 치환한다. */
function withBareIds(json: string): string {
  return json.replace(/"__int64__(\d+)"/g, '$1');
}

export function tiktokPage(
  videos: TikTokVideoSeed[],
  options: {
    now: Date;
    cursor: number;
    hasMore: boolean;
    searchId?: string;
    idField?: 'id' | 'video_id';
  },
): string {
  const idField = options.idField ?? 'id';
  const body = {
    data: {
      videos: videos.map((v) => ({
        ...(v.id !== null && { [idField]: `__int64__${v.id}` }),
        ...(v.username !== undefined && { username: v.username }),
        video_description: v.description,
        create_time: Math.floor((options.now.getTime() - v.hoursAgo * HOUR) / 1000),
        hashtag_names: v.hashtags,
        region_code: 'US',
        ...(v.views !== null && { view_count: v.views ?? 0 }),
        ...(v.likes !== null && { like_count: v.likes ?? 0 }),
        ...(v.comments !== null && { comment_count: v.comments ?? 0 }),
        ...(v.shares !== null && { share_count: v.shares ?? 0 }),
      })),
      cursor: options.cursor,
      has_more: options.hasMore,
      search_id: options.searchId ?? '7300000000000000000',
    },
    error: { code: 'ok', message: '', log_id: '20261124000000DEMO0000000000000000' },
  };
  return withBareIds(JSON.stringify(body));
}

/* ── Instagram Graph API ─────────────────────────────────────────── */

export interface InstagramMediaSeed {
  id: string;
  shortcode: string;
  /** /p/와 /reel/ 중복 재현용 */
  path?: 'p' | 'reel';
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  hoursAgo: number;
  /** null이면 필드 자체를 뺀다. 소유자가 좋아요를 숨긴 경우의 실제 응답 형태다. */
  likes: number | null;
  comments: number;
}

export function igHashtagSearch(id: string): string {
  return JSON.stringify({ data: [{ id }] });
}

export function igRecentMedia(
  media: InstagramMediaSeed[],
  options: { now: Date; next?: string },
): string {
  return JSON.stringify({
    data: media.map((m) => ({
      id: m.id,
      caption: m.caption,
      media_type: m.mediaType,
      permalink: `https://www.instagram.com/${m.path ?? 'p'}/${m.shortcode}/`,
      timestamp: new Date(options.now.getTime() - m.hoursAgo * HOUR)
        .toISOString()
        .replace('.000Z', '+0000'),
      ...(m.likes !== null && { like_count: m.likes }),
      comments_count: m.comments,
    })),
    paging: {
      // 문서: after 커서는 모든 페이지에서 같은 값이다
      cursors: { after: 'QVFIUmxtZAEMODemoCursor' },
      ...(options.next && { next: options.next }),
    },
  });
}

/** Graph API 오류 응답. 형식은 error-handling 문서 예시를 따른다. */
export function graphError(code: number, message: string, status = 400): HttpResponse {
  return httpError(status, {
    error: { message, type: 'OAuthException', code, fbtrace_id: 'DemoTrace0001' },
  });
}
