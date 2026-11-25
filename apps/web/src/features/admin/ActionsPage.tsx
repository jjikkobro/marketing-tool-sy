import type { Proposal } from '@studio/collector/schema';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { cn } from '../../lib/cn';
import { ProposalList } from '../workflow/ProposalList';
import { ReviewerField } from '../workflow/ReviewerField';
import { useWorkspace } from '../workflow/useWorkspace';

type ActionTab = 'pending' | 'done' | 'blocked';

const TABS: { id: ActionTab; label: string; match: (p: Proposal) => boolean }[] = [
  {
    id: 'pending',
    label: '확인 필요',
    match: (p) => p.kind === 'operator_action' && p.status === 'pending',
  },
  {
    id: 'done',
    label: '처리함',
    match: (p) => p.kind === 'operator_action' && p.status !== 'pending' && p.status !== 'blocked',
  },
  // 모든 종류의 차단 기록. 가드가 무엇을 왜 막았는지 운영자가 한곳에서 본다
  { id: 'blocked', label: '가드 차단 기록', match: (p) => p.status === 'blocked' },
];

/**
 * Admin · 운영 조치.
 * 토큰 갱신, 권한 확인처럼 에이전트가 실행할 수 없고 사람이 해야 하는 일. 마케터의 흐름과 분리했다.
 */
export function ActionsPage() {
  const workspace = useWorkspace();
  const { snapshot } = workspace;
  const [tab, setTab] = useState<ActionTab>('pending');
  const proposals = snapshot.data?.snapshot.proposals ?? [];
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="운영 조치"
        description="토큰 갱신이나 권한 확인처럼 에이전트가 실행할 수 없어 사람이 직접 해야 하는 일입니다. AI 제안 받기에서 기획안·수집 제안과 함께 만들어지고, 처리한 사람이 확인을 남깁니다."
      />
      {snapshot.isPending ? (
        <LoadingBlock className="h-64" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-square border border-ink-200 bg-white px-5 py-3">
            <div role="tablist" aria-label="운영 조치 상태" className="flex gap-1">
              {TABS.map(({ id, label, match }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    tab === id
                      ? 'bg-charcoal font-semibold text-white'
                      : 'text-ink-600 hover:bg-ink-100',
                  )}
                >
                  {label} <span className="tabular-nums">{proposals.filter(match).length}</span>
                </button>
              ))}
            </div>
            <ReviewerField reviewable={snapshot.data.reviewable} />
          </div>
          <ProposalList
            proposals={proposals.filter((p) => current?.match(p) ?? true)}
            workspace={workspace}
            runs={snapshot.data.snapshot.runs}
            empty={
              tab === 'pending' ? (
                <>
                  확인할 운영 조치가 없습니다. 수집 상태는{' '}
                  <Link to="/operations" className="font-semibold text-brand-700 hover:underline">
                    수집 운영 모니터
                  </Link>
                  에서 볼 수 있습니다.
                </>
              ) : (
                '해당하는 기록이 없습니다.'
              )
            }
          />
        </>
      )}
    </div>
  );
}
