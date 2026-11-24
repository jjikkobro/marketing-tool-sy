import type { Proposal } from '@studio/collector/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { decide, snapshotQuery, type Decision } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { cn } from '../../lib/cn';
import { AgentLoop } from './AgentLoop';
import { filterLabel, matchesFilter, type ProposalFilter } from './labels';
import { ProposalCard } from './ProposalCard';

const REVIEWER_KEY = 'social-collector:reviewer';
const FILTERS: ProposalFilter[] = ['pending', 'blocked', 'decided', 'all'];

export function ProposalsPage() {
  const snapshot = useQuery(snapshotQuery());
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ProposalFilter>('pending');
  const [reviewer, setReviewer] = useState(() => localStorage.getItem(REVIEWER_KEY) ?? '');

  const mutation = useMutation({
    mutationFn: (input: { id: Proposal['id']; decision: Decision; note: string }) =>
      decide(input.id, input.decision, { reviewer, note: input.note.trim() || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: snapshotQuery().queryKey }),
  });

  function updateReviewer(value: string) {
    setReviewer(value);
    localStorage.setItem(REVIEWER_KEY, value);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent"
        title="에이전트 제안 검토"
        description="LLM이 다음 수집을 제안하면 가드가 근거와 수치를 SQL로 검증하고, 사람이 승인해야만 실행합니다."
        actions={
          snapshot.data && (
            <SnapshotBadge
              generatedAt={snapshot.data.snapshot.generatedAt}
              scenario={snapshot.data.snapshot.scenario}
            />
          )
        }
      />

      <AgentLoop />

      {snapshot.isPending ? (
        <LoadingBlock className="h-96" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-square border border-ink-200 bg-white px-5 py-3">
            <div role="tablist" aria-label="제안 상태" className="flex gap-1">
              {FILTERS.map((id) => {
                const count = snapshot.data.snapshot.proposals.filter((p) =>
                  matchesFilter(p, id),
                ).length;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm transition-colors',
                      filter === id
                        ? 'bg-charcoal font-semibold text-white'
                        : 'text-ink-600 hover:bg-ink-100',
                    )}
                  >
                    {filterLabel[id]} <span className="tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            {snapshot.data.reviewable ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-600">검토자</span>
                <input
                  value={reviewer}
                  onChange={(event) => updateReviewer(event.target.value)}
                  placeholder="이름"
                  className="h-8 w-36 rounded-square border border-ink-300 px-2.5 text-sm"
                />
              </label>
            ) : (
              <span className="text-xs text-ink-600">정적 데모 · 읽기 전용</span>
            )}
          </div>

          <div className="space-y-3">
            {snapshot.data.snapshot.proposals
              .filter((proposal) => matchesFilter(proposal, filter))
              .map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  reviewable={snapshot.data.reviewable}
                  reviewer={reviewer}
                  pending={mutation.isPending && mutation.variables.id === proposal.id}
                  error={
                    mutation.isError && mutation.variables.id === proposal.id
                      ? mutation.error.message
                      : null
                  }
                  onDecide={(decision, note) =>
                    mutation.mutate({ id: proposal.id, decision, note })
                  }
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
