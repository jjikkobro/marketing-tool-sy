import type { CollectQuery, ErrorKind, Platform, SocialContent, SourceKind } from '../schema.ts';

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * 본문을 문자열(text) 그대로 넘긴다.
 * TikTok의 int64 ID는 JSON.parse를 거치면 정밀도를 잃는다. 그래서 파싱은 어댑터가 직접 한다.
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

export interface Rejection {
  reason: string;
  /** 디버깅용 원본 일부. 개인정보가 섞이지 않도록 어댑터가 잘라서 넘긴다. */
  sample: string;
}

export interface PageWarning {
  kind: ErrorKind;
  message: string;
}

export interface ParsedPage {
  items: SocialContent[];
  rejected: Rejection[];
  warnings: PageWarning[];
  nextCursor: string | null;
}

/**
 * 수집 어댑터 계약.
 * - fetchPage: 네트워크 IO만 한다. 실패는 CollectorError로 분류해서 던진다.
 * - parsePage: 순수 함수다. 같은 입력이면 항상 같은 결과를 내므로 녹화한 응답으로 테스트할 수 있다.
 */
export interface SourceAdapter {
  readonly id: string;
  readonly platform: Platform;
  readonly source: SourceKind;
  fetchPage(query: CollectQuery, cursor: string | null): Promise<string>;
  parsePage(body: string, query: CollectQuery): ParsedPage;
}

export function truncateSample(value: unknown, max = 160): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
