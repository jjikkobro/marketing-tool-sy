import { CollectorError } from '../core/errors.ts';
import type { HttpRequest, HttpResponse, Transport } from './types.ts';

/**
 * 실제 네트워크 전송. 실서비스 호출은 아직 검증하지 않았다 (docs/decisions/0001 참고).
 * 어댑터는 Transport만 알기 때문에, 테스트와 데모에서는 녹화된 응답(fixtureTransport)으로 바꿔 끼운다.
 */
export function fetchTransport({ timeoutMs = 15_000 } = {}): Transport {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new CollectorError('network', `네트워크 오류: ${String(error)}`, { cause: error });
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      text: await response.text(),
    };
  };
}

/** Retry-After 헤더(초 또는 HTTP 날짜)를 ms로 바꾼다. */
export function parseRetryAfter(value: string | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now.getTime());
}

/**
 * int64 ID 필드를 JSON.parse 전에 문자열로 감싼다.
 * TikTok Research API 문서 예시의 video_id(702874395068494965)는 2^53보다 커서
 * 그대로 파싱하면 702874395068494976처럼 다른 값이 된다. 그러면 서로 다른 영상이 같은 키로 합쳐질 수 있다.
 */
export function parseJsonPreservingIds(text: string, fields: readonly string[]): unknown {
  const pattern = new RegExp(`"(${fields.join('|')})"\\s*:\\s*(-?\\d+)`, 'g');
  return JSON.parse(text.replace(pattern, '"$1":"$2"'));
}
