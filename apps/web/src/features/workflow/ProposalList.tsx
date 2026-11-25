import type { CollectionRun, Proposal } from '@studio/collector/schema';
import type { ReactNode } from 'react';
import { ProposalCard } from '../proposals/ProposalCard';
import type { useWorkspace } from './useWorkspace';

interface ProposalListProps {
  proposals: Proposal[];
  workspace: ReturnType<typeof useWorkspace>;
  runs: CollectionRun[];
  /** 카드 아래 다음 단계 */
  next?: (proposal: Proposal) => ReactNode;
  empty: ReactNode;
  /** 결정이 끝난 뒤 (예: 실행 결과로 표를 좁히기) */
  onDecided?: (proposal: Proposal) => void;
}

/** 제안 카드 목록. 어느 화면이든 결정(승인·거절·확인)은 같은 경로로 서버에 간다. */
export function ProposalList({
  proposals,
  workspace,
  runs,
  next,
  empty,
  onDecided,
}: ProposalListProps) {
  const { snapshot, reviewer, decision, plan } = workspace;
  if (proposals.length === 0) {
    return (
      <p className="rounded-square border border-dashed border-ink-300 bg-white px-6 py-8 text-center text-sm text-ink-600">
        {empty}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          reviewable={snapshot.data?.reviewable ?? false}
          fresh={plan.data?.proposalIds.includes(proposal.id) ?? false}
          reviewer={reviewer}
          pending={decision.isPending && decision.variables.id === proposal.id}
          error={
            decision.isError && decision.variables.id === proposal.id
              ? decision.error.message
              : null
          }
          onDecide={(choice, note) =>
            decision.mutate(
              { id: proposal.id, decision: choice, note },
              { onSuccess: (decided) => onDecided?.(decided) },
            )
          }
          run={runs.find((run) => run.id === proposal.resultRunId) ?? null}
          next={next?.(proposal)}
        />
      ))}
    </div>
  );
}
