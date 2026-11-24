/**
 * 로컬 검토 API의 쓰기 요청 검사 (CSRF·DNS 리바인딩 방지). serve.ts가 쓰고, 테스트가 직접 검사한다.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

/**
 * 쓰기 요청이 이 서비스의 화면에서 온 것인지 확인한다. 실패 이유를 돌려준다.
 * publicHosts: 공개 배포 주소(예: social-collector.onrender.com). 로컬 주소는 항상 허용한다.
 */
export function rejectCrossSite(
  headers: IncomingHttpHeaders,
  token: string,
  publicHosts: readonly string[] = [],
): string | null {
  if (!isAllowedHost(headers.host, publicHosts)) return '허용하지 않는 Host입니다';
  const origin = headers.origin;
  if (origin !== undefined && !isSameOrigin(origin, headers.host))
    return '다른 출처에서 온 요청입니다';
  const site = headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none')
    return '다른 사이트에서 온 요청입니다';
  if (!headers['content-type']?.startsWith('application/json'))
    return 'Content-Type은 application/json이어야 합니다';
  const given = Buffer.from(String(headers['x-review-token'] ?? ''));
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return '검토 토큰이 없거나 맞지 않습니다';
  return null;
}

export function isLocalHost(host: string | undefined): boolean {
  return LOCAL_HOST.test(host ?? '');
}

export function isAllowedHost(
  host: string | undefined,
  publicHosts: readonly string[] = [],
): boolean {
  return isLocalHost(host) || (host !== undefined && publicHosts.includes(host));
}

/** Origin이 요청을 받은 Host와 같은지. 로컬 개발에서는 Vite 프록시를 거치므로 로컬끼리는 같은 출처로 본다. */
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (LOCAL_ORIGIN.test(origin) && isLocalHost(host)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
