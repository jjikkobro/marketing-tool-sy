import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Lightbulb, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { requestReferenceBrief } from '../../api/snapshot';
import { Button } from '../../components/ui/Button';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { cn } from '../../lib/cn';
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
/** 한 기획에 근거로 고를 수 있는 레퍼런스 수 (서버 스키마와 같다) */
const MAX_REFERENCES = 5;
/** 최근에 승인해 실행한 수집 제안을 몇 개까지 보여줄지 */
const RECENT_EXECUTED = 3;

/**
 * 1단계 레퍼런스 수집.
 * 에이전트의 수집 제안을 이 화면 안에 둔다. 승인하면 그 자리에서 실제 수집이 돌고,
 * 결과(새로 들어온 콘텐츠)가 바로 아래 표에 강조되어 "승인 → 데이터"가 한 화면에서 이어진다.
 */
export function ReferencesPage() {
  const workspace = useWorkspace();
  const { snapshot, requireToken, refresh } = workspace;
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const navigate = useNavigate();

  // 고른 레퍼런스로 기획안을 받고, 결과를 2단계 콘텐츠 기획 화면에서 이어서 본다
  const brief = useMutation({
    mutationFn: () => requestReferenceBrief([...selected], requireToken()),
    onSuccess: async (result) => {
      await refresh();
      navigate('/planning', { state: { referenceBrief: result, references: selected.size } });
    },
  });

  function toggle(factId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(factId)) next.delete(factId);
      else if (next.size < MAX_REFERENCES) next.add(factId);
      return next;
    });
  }
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
          <CollectProposals
            workspace={workspace}
            // 승인이 끝나 실행 결과가 생기면 표를 그 실행이 가져온 콘텐츠로 좁힌다
            onExecuted={(id) => setParams({ run: String(id) }, { replace: true })}
          />

          <div data-help="run-summary">
            <RunSummaryStrip
              runs={snapshot.data.snapshot.runs}
              errors={snapshot.data.snapshot.errors}
            />
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="space-y-6" data-help="reference-filters">
              <FormatPanel formats={snapshot.data.snapshot.formats} />
              <HashtagPanel
                hashtags={snapshot.data.snapshot.hashtags}
                related={snapshot.data.snapshot.related}
                selected={hashtag}
                onSelect={setHashtag}
              />
            </div>
            <div data-help="reference-table" className="min-w-0">
              <ContentTable
                contents={snapshot.data.snapshot.contents}
                hashtag={hashtag}
                recorded={snapshot.data.snapshot.dataMode === 'recorded'}
                runId={runId}
                run={snapshot.data.snapshot.runs.find((r) => r.id === runId) ?? null}
                onClearRun={() => setParams({}, { replace: true })}
                selected={selected}
                onToggleSelect={snapshot.data.reviewable ? toggle : undefined}
                selectionFull={selected.size >= MAX_REFERENCES}
              />
            </div>
          </div>

          {snapshot.data.reviewable && (
            <SelectionBar
              count={selected.size}
              running={brief.isPending}
              error={brief.isError ? brief.error.message : null}
              claude={snapshot.data.live?.claude.enabled ?? false}
              onClear={() => setSelected(new Set())}
              onCreate={() => brief.mutate()}
            />
          )}
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
  // 기본은 접어 둔다. 수집한 레퍼런스(표)가 이 화면의 주인공이고, 제안은 필요할 때 펼쳐 본다
  const [open, setOpen] = useState(false);
  const { plan, reset } = workspace;
  const data = workspace.snapshot.data;
  if (!data) return null;
  const collect = data.snapshot.proposals.filter((p) => COLLECT_KINDS.has(p.kind));
  const pending = collect.filter((p) => p.status === 'pending');
  const executed = collect
    .filter((p) => p.status === 'executed' || p.status === 'failed')
    .slice(0, RECENT_EXECUTED);

  return (
    <section
      aria-labelledby="collect-proposals"
      data-help="collect-proposals"
      className="rounded-square border border-ink-200 bg-white"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="collect-proposals-body"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-ink-50"
      >
        <div className="min-w-0 flex-1">
          <h2 id="collect-proposals" className="flex items-center gap-2 text-base font-semibold">
            에이전트의 수집 제안
            {pending.length > 0 && (
              <span className="rounded-full bg-brand-700 px-2 text-xs font-semibold text-white tabular-nums">
                검토 대기 {pending.length}
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-600">
            수집한 데이터에서 함께 쓰인 해시태그 중 아직 모으지 않은 것을 제안합니다. 승인하면 그
            자리에서 수집이 실행됩니다.
          </p>
        </div>
        <ChevronDown
          aria-hidden
          className={cn('size-5 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id="collect-proposals-body" className="space-y-3 border-t border-ink-200 p-5">
          <PlanPanel
            title="AI에게 다음 수집 제안 받기"
            live={data.live}
            reviewable={data.reviewable}
            running={plan.isPending}
            result={plan.data ?? null}
            error={plan.isError ? plan.error.message : reset.isError ? reset.error.message : null}
            proposals={data.snapshot.proposals}
            onPlan={() => plan.mutate()}
            onReset={() => reset.mutate()}
          />
          <div className="flex justify-end">
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
        </div>
      )}
    </section>
  );
}

/**
 * 레퍼런스를 고르면 화면 아래에 뜨는 바. "이 레퍼런스로 기획안 만들기"로 2단계와 바로 이어진다.
 * 아무것도 고르지 않았을 때는 고를 수 있다는 것만 알린다.
 */
function SelectionBar({
  count,
  running,
  error,
  claude,
  onClear,
  onCreate,
}: {
  count: number;
  running: boolean;
  error: string | null;
  claude: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  if (count === 0) {
    return (
      <p className="text-center text-xs text-ink-600" data-help="reference-selection">
        표에서 레퍼런스를 골라(최대 {MAX_REFERENCES}개) 그 내용을 바탕으로 기획안을 만들 수
        있습니다.
      </p>
    );
  }
  return (
    <div
      data-help="reference-selection"
      className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-square border border-charcoal bg-white px-5 py-3 shadow-lg"
    >
      <Lightbulb aria-hidden className="size-5 text-brand-700" />
      <p className="min-w-0 flex-1 text-sm">
        <strong>레퍼런스 {count}개</strong> 선택
        <span className="ml-2 text-xs text-ink-600">
          {running
            ? `${claude ? 'Claude가' : '규칙으로'} 고른 레퍼런스를 읽고 기획안을 쓰는 중… (보통 20~40초)`
            : claude
              ? 'Claude가 이 레퍼런스의 구성·훅을 근거로 기획안을 씁니다. 검증기는 고른 레퍼런스를 인용했는지도 확인합니다.'
              : 'Claude 키가 없어 고른 레퍼런스의 포맷으로 템플릿 기획안을 만듭니다.'}
        </span>
        {error && (
          <span role="alert" className="block text-xs text-burgundy">
            {error}
          </span>
        )}
      </p>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={running}>
        <X aria-hidden className="size-3.5" />
        선택 해제
      </Button>
      <Button size="sm" onClick={onCreate} disabled={running}>
        <Lightbulb aria-hidden className="size-3.5" />
        {running ? '기획안 만드는 중…' : '이 레퍼런스로 기획안 만들기'}
      </Button>
    </div>
  );
}
