/**
 * 콘텐츠 식별과 URL 정규화.
 *
 * 원본(legacy/src/pipeline/social/collectors.js:64-82)의 버그 두 가지를 고친 버전이다.
 *  1. fingerprint 폴백 `${platform}:${externalId || ''}`는 ID가 없어도 'instagram:'이라는 참 값이 되어
 *     제목·본문 폴백에 도달하지 못했다. URL도 ID도 없는 항목은 전부 같은 해시로 합쳐져 하나만 남았다.
 *     → 식별할 수 없는 항목은 합치지 않고 null을 돌려준다. 호출하는 쪽이 "거부"로 기록한다.
 *  2. Instagram의 /p/X, /reel/X, /tv/X는 같은 게시물인데 다른 URL로 취급해 중복 저장했다.
 *     → shortcode 기준으로 /p/X 하나로 맞춘다.
 */
import type { Platform } from '../schema.ts';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igsh',
  'is_from_webapp',
  'sender_device',
];
const INSTAGRAM_MEDIA_PATH = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

export function canonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  url.hash = '';
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^m\./, 'www.');
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);

  if (url.hostname === 'instagram.com' || url.hostname === 'www.instagram.com') {
    const match = INSTAGRAM_MEDIA_PATH.exec(url.pathname);
    if (match) return `https://www.instagram.com/p/${match[1]}`;
  }

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  return `${url.origin}${path}${url.search}`;
}

/**
 * 저장 키. 플랫폼 고유 ID가 있으면 그것을, 없으면 정규화한 URL을 쓴다.
 * 둘 다 없으면 null이다. 이때 제목이나 본문으로 추측해 합치지 않는다. 다른 콘텐츠를 지워 버릴 수 있기 때문이다.
 */
export function contentKey(
  platform: Platform,
  item: { platformContentId?: string | null; url?: string | null },
): string | null {
  const id = item.platformContentId?.trim();
  if (id) return `${platform}:id:${id}`;
  const url = canonicalUrl(item.url);
  if (url) return `${platform}:url:${url}`;
  return null;
}
