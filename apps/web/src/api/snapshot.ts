import {
  liveStatusSchema,
  planResponseSchema,
  proposalSchema,
  snapshotSchema,
  type LiveStatus,
  type PlanResponse,
  type Proposal,
  type Snapshot,
} from '@studio/collector/schema';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

/*
 * 데이터 출처는 두 가지다.
 * - 라이브 서버(npm run live, 배포): /api/live에서 방문자 샌드박스의 데이터와 라이브 상태를 읽는다.
 *   AI 제안 요청과 승인·거절을 할 수 있다.
 * - 정적 배포(GitHub Pages): public/data/snapshot.json을 읽는다. API가 없으므로 읽기 전용이다.
 * 어느 쪽이든 collector와 같은 zod 스키마로 런타임 검증을 한다.
 */
export interface SnapshotResult {
  snapshot: Snapshot;
  /** 라이브 서버에 연결되어 AI 호출·승인을 할 수 있는지 */
  reviewable: boolean;
  /** 라이브 서버가 응답 헤더로만 주는 세션 토큰. 쓰기 요청에 붙인다 (CSRF 방지) */
  reviewToken: string | null;
  live: LiveStatus | null;
}

const liveEnvelopeSchema = z.object({ snapshot: snapshotSchema, live: liveStatusSchema });

const api = (path: string) => `${import.meta.env.BASE_URL}api/${path}`;

async function fetchSnapshot(): Promise<SnapshotResult> {
  try {
    const response = await fetch(api('live'), { credentials: 'same-origin' });
    const token = response.headers.get('x-review-token');
    if (
      response.ok &&
      token &&
      response.headers.get('content-type')?.includes('application/json')
    ) {
      const { snapshot, live } = liveEnvelopeSchema.parse(await response.json());
      return { snapshot, live, reviewable: true, reviewToken: token };
    }
  } catch {
    // 라이브 서버가 없으면 정적 스냅샷으로 넘어간다
  }
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`);
  if (!response.ok) throw new Error(`스냅샷을 불러오지 못했습니다 (${response.status})`);
  return {
    snapshot: snapshotSchema.parse(await response.json()),
    live: null,
    reviewable: false,
    reviewToken: null,
  };
}

export const snapshotQuery = () =>
  queryOptions({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
    staleTime: 30_000,
  });

async function post<T>(
  path: string,
  body: unknown,
  token: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(api(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-review-token': token },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : '요청 실패';
    throw new Error(message);
  }
  return schema.parse(payload);
}

export type Decision = 'approve' | 'reject' | 'ack';

export function decide(
  id: Proposal['id'],
  decision: Decision,
  body: { reviewer: string; note?: string },
  reviewToken: string,
): Promise<Proposal> {
  return post(`proposals/${id}/${decision}`, body, reviewToken, proposalSchema);
}

/** AI에게 다음 수집 제안을 받는다. 서버가 Claude를 실제로 호출하거나, 한도를 넘으면 녹화 응답으로 대체한다. */
export function requestPlan(reviewToken: string): Promise<PlanResponse> {
  return post('agent/plan', {}, reviewToken, planResponseSchema);
}

/** 내 샌드박스를 처음 상태로 되돌린다 */
export function resetSandbox(reviewToken: string): Promise<{ ok: boolean }> {
  return post('session/reset', {}, reviewToken, z.object({ ok: z.boolean() }));
}
