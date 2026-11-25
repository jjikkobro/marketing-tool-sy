import type { Snapshot } from '@studio/collector/schema';

/**
 * 단계별로 "사람이 처리할 것"의 수. 사이드바와 단계 표시에 같은 값을 쓴다.
 * - 레퍼런스 수집: 검토 대기 중인 수집·재실행 제안
 * - 콘텐츠 기획: 검토 대기 중인 기획안
 * - 초안 발행: 초안이 아직 없는 채택 기획안 + 발행을 기다리는 초안
 * - 운영 조치: 확인을 기다리는 운영 조치
 */
export type WorkCounts = Record<'references' | 'planning' | 'drafts' | 'actions', number>;

export function workCounts(snapshot: Snapshot): WorkCounts {
  const pending = snapshot.proposals.filter((p) => p.status === 'pending');
  const drafted = new Set(
    snapshot.drafts.filter((d) => d.status !== 'discarded').map((d) => d.proposalId),
  );
  return {
    references: pending.filter((p) => p.kind === 'collect_query' || p.kind === 'retry_run').length,
    planning: pending.filter((p) => p.kind === 'content_brief').length,
    drafts:
      snapshot.proposals.filter(
        (p) => p.kind === 'content_brief' && p.status === 'approved' && !drafted.has(p.id),
      ).length + snapshot.drafts.filter((d) => d.status === 'draft').length,
    actions: pending.filter((p) => p.kind === 'operator_action').length,
  };
}
