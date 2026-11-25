import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { ContentTable } from '../discovery/ContentTable';
import { FormatPanel } from '../discovery/FormatPanel';
import { HashtagPanel } from '../discovery/HashtagPanel';
import { RunSummaryStrip } from '../discovery/RunSummaryStrip';
import { PlanPanel } from '../proposals/PlanPanel';
import { ProposalList } from '../workflow/ProposalList';
import { ReviewerField } from '../workflow/ReviewerField';
import { useWorkspace } from '../workflow/useWorkspace';
import { WorkflowSteps } from '../workflow/WorkflowSteps';

const COLLECT_KINDS = new Set(['collect_query', 'retry_run']);
/** 최근에 승인해 실행한 수집 제안을 몇 개까지 보여줄지 */
const RECENT_EXECUTED = 3;

/**
 * 1단계 레퍼런스 수집.
 * 에이전트의 수집 제안을 이 화면 안에 둔다. 승인하면 그 자리에서 실제 수집이 돌고,
 * 결과(새로 들어온 콘텐츠)가 바로 아래 표에 강조되어 "승인 → 데이터"가 한 화면에서 이어진다.
 */
export function ReferencesPage() {
  const workspace = useWorkspace();
  const { snapshot, plan, reset } = workspace;
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const runParam = Number(params.get('run'));
  const runId = Number.isInteger(runParam) && runParam > 0 ? runParam : null;

  // 실행 결과로 표를 좁히면 표 위치로 이동한다
  useEffect(() => {
    if (runId === null || !snapshot.data) return;
    document.getElementById('reference-table')?.scrollIntoView({ behavior: 'smooth' });
  }, [runId, snapshot.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Step 1 · References"
        title="레퍼런스 수집"
        description="키워드·해시태그로 TikTok·Instagram·YouTube 숏폼을 모읍니다. 에이전트가 다음에 모을 것을 제안하고, 승인하면 바로 수집되어 아래 표에 들어옵니다."
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
            title="AI에게 다음 수집 제안 받기"
            live={snapshot.data.live}
            reviewable={snapshot.data.reviewable}
            running={plan.isPending}
            result={plan.data ?? null}
            error={plan.isError ? plan.error.message : reset.isError ? reset.error.message : null}
            proposals={snapshot.data.snapshot.proposals}
            onPlan={() => plan.mutate()}
            onReset={() => reset.mutate()}
          />

          <CollectProposals
            workspace={workspace}
            // 승인이 끝나 실행 결과가 생기면 표를 그 실행이 가져온 콘텐츠로 좁힌다
            onExecuted={(id) => setParams({ run: String(id) }, { replace: true })}
          />

          <RunSummaryStrip
            runs={snapshot.data.snapshot.runs}
            errors={snapshot.data.snapshot.errors}
          />
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="space-y-6">
              <FormatPanel formats={snapshot.data.snapshot.formats} />
              <HashtagPanel
                hashtags={snapshot.data.snapshot.hashtags}
                related={snapshot.data.snapshot.related}
                selected={hashtag}
                onSelect={setHashtag}
              />
            </div>
            <ContentTable
              contents={snapshot.data.snapshot.contents}
              hashtag={hashtag}
              recorded={snapshot.data.snapshot.dataMode === 'recorded'}
              runId={runId}
              run={snapshot.data.snapshot.runs.find((r) => r.id === runId) ?? null}
              onClearRun={() => setParams({}, { replace: true })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CollectProposals({
  workspace,
  onExecuted,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  onExecuted: (runId: number) => void;
}) {
  const data = workspace.snapshot.data;
  if (!data) return null;
  const collect = data.snapshot.proposals.filter((p) => COLLECT_KINDS.has(p.kind));
  const pending = collect.filter((p) => p.status === 'pending');
  const executed = collect
    .filter((p) => p.status === 'executed' || p.status === 'failed')
    .slice(0, RECENT_EXECUTED);

  return (
    <section aria-labelledby="collect-proposals" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="collect-proposals" className="text-base font-semibold">
            에이전트의 수집 제안
          </h2>
          <p className="text-sm text-ink-600">
            수집한 데이터에서 함께 쓰인 해시태그 중 아직 모으지 않은 것을 제안합니다. 승인하면 그
            자리에서 수집이 실행됩니다.
          </p>
        </div>
        <ReviewerField reviewable={data.reviewable} />
      </div>
      <ProposalList
        proposals={[...pending, ...executed]}
        workspace={workspace}
        runs={data.snapshot.runs}
        onDecided={(decided) => {
          if (decided.resultRunId !== null) onExecuted(decided.resultRunId);
        }}
        empty="검토를 기다리는 수집 제안이 없습니다. 위의 “제안 받기”를 누르면 AI가 다음 수집 대상을 제안합니다."
      />
    </section>
  );
}
