import type { Proposal } from '@studio/collector/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decide,
  requestPlan,
  resetSandbox,
  snapshotQuery,
  type Decision,
} from '../../api/snapshot';
import { useReviewer } from './reviewer';

/**
 * 화면마다 반복되는 것: 스냅샷 읽기, 세션 토큰, 제안 결정, AI 계획 요청, 샌드박스 초기화.
 * 쓰기가 끝나면 스냅샷을 다시 읽어 모든 화면(사이드바 숫자 포함)이 같은 상태를 본다.
 */
export function useWorkspace() {
  const snapshot = useQuery(snapshotQuery());
  const queryClient = useQueryClient();
  const reviewer = useReviewer();

  const requireToken = () => {
    const token = snapshot.data?.reviewToken;
    if (!token) throw new Error('라이브 서버에 연결되어 있지 않습니다');
    return token;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: snapshotQuery().queryKey });

  const decision = useMutation({
    mutationFn: (input: { id: Proposal['id']; decision: Decision; note: string }) =>
      decide(
        input.id,
        input.decision,
        { reviewer, note: input.note.trim() || undefined },
        requireToken(),
      ),
    onSuccess: refresh,
  });

  const plan = useMutation({
    mutationFn: () => requestPlan(requireToken()),
    onSuccess: refresh,
  });

  const reset = useMutation({
    mutationFn: () => resetSandbox(requireToken()),
    onSuccess: async () => {
      plan.reset();
      await refresh();
    },
  });

  return { snapshot, reviewer, requireToken, refresh, decision, plan, reset };
}
