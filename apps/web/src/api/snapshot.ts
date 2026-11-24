import {
  proposalSchema,
  snapshotSchema,
  type Proposal,
  type Snapshot,
} from '@studio/collector/schema';
import { queryOptions } from '@tanstack/react-query';

/*
 * 데이터 출처는 두 가지다.
 * - 로컬 검토 모드(npm run dev:live): collector 검토 API(/api/snapshot)에서 읽고, 화면에서 승인·거절할 수 있다.
 * - 정적 배포: public/data/snapshot.json을 읽는다. 승인 API가 없으므로 읽기 전용이다.
 * 어느 쪽이든 collector와 같은 zod 스키마로 런타임 검증을 한다.
 */
export interface SnapshotResult {
  snapshot: Snapshot;
  /** 검토 API에 연결되어 사람이 결정할 수 있는지 */
  reviewable: boolean;
  /** 검토 API가 스냅샷 응답 헤더로만 주는 토큰. 쓰기 요청에 붙인다 (CSRF 방지) */
  reviewToken: string | null;
}

async function fetchSnapshot(): Promise<SnapshotResult> {
  try {
    const live = await fetch(`${import.meta.env.BASE_URL}api/snapshot`);
    const token = live.headers.get('x-review-token');
    if (live.ok && token && live.headers.get('content-type')?.includes('application/json')) {
      return {
        snapshot: snapshotSchema.parse(await live.json()),
        reviewable: true,
        reviewToken: token,
      };
    }
  } catch {
    // 검토 API가 없으면 정적 스냅샷으로 넘어간다
  }
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`);
  if (!response.ok) throw new Error(`스냅샷을 불러오지 못했습니다 (${response.status})`);
  return {
    snapshot: snapshotSchema.parse(await response.json()),
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

export type Decision = 'approve' | 'reject' | 'ack';

export async function decide(
  id: Proposal['id'],
  decision: Decision,
  body: { reviewer: string; note?: string },
  reviewToken: string,
): Promise<Proposal> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/proposals/${id}/${decision}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-review-token': reviewToken },
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
  return proposalSchema.parse(payload);
}
