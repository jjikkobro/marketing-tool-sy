import type { Proposal } from '@studio/collector/schema';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { cn } from '../../lib/cn';
import { FormatPanel } from '../discovery/FormatPanel';
import { PlanPanel } from '../proposals/PlanPanel';
import { ProposalList } from '../workflow/ProposalList';
import { ReviewerField } from '../workflow/ReviewerField';
import { useWorkspace } from '../workflow/useWorkspace';
import { WorkflowSteps } from '../workflow/WorkflowSteps';

type BriefTab = 'pending' | 'adopted' | 'rejected' | 'blocked';

const TABS: { id: BriefTab; label: string; match: (p: Proposal) => boolean }[] = [
  { id: 'pending', label: '검토 대기', match: (p) => p.status === 'pending' },
  { id: 'adopted', label: '채택', match: (p) => p.status === 'approved' },
  { id: 'rejected', label: '거절', match: (p) => p.status === 'rejected' },
  { id: 'blocked', label: '가드 차단', match: (p) => p.status === 'blocked' },
];

/**
 * 2단계 콘텐츠 기획.
 * AI가 수집 데이터의 포맷(format:*)을 근거로 기획안을 쓰고, 가드가 근거·숫자를 DB와 대조한 뒤,
 * 마케터가 채택하거나 사유를 남기고 거절한다. 채택한 기획안은 3단계(초안 발행)로 넘어간다.
 */
export function PlanningPage() {
  const workspace = useWorkspace();
  const { snapshot, plan, reset } = workspace;
  const [tab, setTab] = useState<BriefTab>('pending');

  // 개요 화면의 "AI에게 기획안 받아보기"로 들어오면 한 번 자동 실행한다
  const location = useLocation();
  const navigate = useNavigate();
  const autoStarted = useRef(false);
  const autoPlan =
    typeof location.state === 'object' && location.state !== null && 'autoPlan' in location.state
      ? location.state.autoPlan === true
      : false;
  useEffect(() => {
    if (!autoPlan || autoStarted.current || !snapshot.data?.reviewable) return;
    autoStarted.current = true;
    navigate(location.pathname, { replace: true, state: null });
    plan.mutate();
  }, [autoPlan, snapshot.data?.reviewable, navigate, location.pathname, plan]);

  const briefs = snapshot.data?.snapshot.proposals.filter((p) => p.kind === 'content_brief') ?? [];
  const drafts = snapshot.data?.snapshot.drafts ?? [];
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Step 2 · Planning"
        title="콘텐츠 기획"
        description="AI가 수집한 레퍼런스의 포맷을 근거로 기획안을 씁니다. 검증기가 근거와 숫자를 데이터베이스 값과 대조하고, 마케터가 채택한 기획안만 초안 단계로 넘어갑니다."
        actions={
          snapshot.data && (
            <SnapshotBadge
              generatedAt={snapshot.data.snapshot.generatedAt}
              scenario={snapshot.data.snapshot.scenario}
            />
          )
        }
      />
      <WorkflowSteps />

      {snapshot.isPending ? (
        <LoadingBlock className="h-96" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : (
        <>
          <PlanPanel
            title="AI에게 기획안 받기"
            live={snapshot.data.live}
            reviewable={snapshot.data.reviewable}
            running={plan.isPending}
            result={plan.data ?? null}
            error={plan.isError ? plan.error.message : reset.isError ? reset.error.message : null}
            proposals={snapshot.data.snapshot.proposals}
            onPlan={() => {
              plan.mutate();
              setTab('pending');
            }}
            onReset={() => reset.mutate()}
          />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-square border border-ink-200 bg-white px-5 py-3">
                <div role="tablist" aria-label="기획안 상태" className="flex gap-1">
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
                      {label} <span className="tabular-nums">{briefs.filter(match).length}</span>
                    </button>
                  ))}
                </div>
                <ReviewerField reviewable={snapshot.data.reviewable} />
              </div>

              <ProposalList
                proposals={briefs.filter((p) => current?.match(p) ?? true)}
                workspace={workspace}
                runs={snapshot.data.snapshot.runs}
                onDecided={(decided) => {
                  if (decided.status === 'approved') setTab('adopted');
                }}
                next={(brief) => {
                  if (brief.status !== 'approved') return null;
                  const count = drafts.filter((d) => d.proposalId === brief.id).length;
                  return (
                    <Link
                      to={`/drafts?brief=${brief.id}`}
                      className="mt-3 inline-flex items-center gap-1 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-white hover:bg-black"
                    >
                      {count > 0 ? `초안 ${count}개 보기 →` : '3단계: 이 기획으로 초안 만들기 →'}
                    </Link>
                  );
                }}
                empty={
                  tab === 'pending'
                    ? '검토를 기다리는 기획안이 없습니다. 위의 “제안 받기”를 누르면 AI가 수집 데이터로 기획안을 씁니다.'
                    : '해당하는 기획안이 없습니다.'
                }
              />
            </div>
            <aside className="space-y-3">
              <p className="text-xs text-ink-600">
                기획안의 근거가 되는 포맷 집계입니다. AI는 이 값(format:*)을 인용해야 하고, 숫자는
                여기 값과 같아야 통과합니다.
              </p>
              <FormatPanel formats={snapshot.data.snapshot.formats} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
