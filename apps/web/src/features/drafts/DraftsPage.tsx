import type { ContentDraft, DraftBody } from '@studio/collector/schema';
import { useMutation } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { discardDraft, publishDraft, requestDraft } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { cn } from '../../lib/cn';
import { ReviewerField } from '../workflow/ReviewerField';
import { useWorkspace } from '../workflow/useWorkspace';
import { WorkflowSteps } from '../workflow/WorkflowSteps';
import { DraftCard } from './DraftCard';

type DraftTab = 'draft' | 'published' | 'closed';

const TABS: { id: DraftTab; label: string; match: (d: ContentDraft) => boolean }[] = [
  { id: 'draft', label: '발행 대기', match: (d) => d.status === 'draft' },
  { id: 'published', label: '발행 확정', match: (d) => d.status === 'published' },
  {
    id: 'closed',
    label: '차단·버림',
    match: (d) => d.status === 'blocked' || d.status === 'discarded',
  },
];

/**
 * 3단계 초안 발행.
 * 채택한 기획안으로 AI가 대본·캡션 초안을 쓰고, 가드가 데이터처럼 보이는 숫자를 막는다.
 * 마케터가 고쳐서 발행을 확정한다. 실제 SNS 게시는 하지 않는다 (승인 없는 외부 실행 경로를 만들지 않는다).
 */
export function DraftsPage() {
  const workspace = useWorkspace();
  const { snapshot, reviewer, requireToken, refresh } = workspace;
  const [tab, setTab] = useState<DraftTab>('draft');
  const [params] = useSearchParams();
  const focusBrief = Number(params.get('brief')) || null;

  const create = useMutation({
    mutationFn: (briefId: number) => requestDraft(briefId, requireToken()),
    onSuccess: async () => {
      await refresh();
      setTab('draft');
    },
  });
  const decide = useMutation({
    mutationFn: (
      input:
        | { id: number; action: 'publish'; note: string; edits: Partial<DraftBody> }
        | { id: number; action: 'discard'; note: string },
    ) =>
      input.action === 'publish'
        ? publishDraft(
            input.id,
            { reviewer, note: input.note.trim() || undefined, edits: input.edits },
            requireToken(),
          )
        : discardDraft(input.id, { reviewer, note: input.note }, requireToken()),
    onSuccess: async (draft) => {
      await refresh();
      if (draft.status === 'published') setTab('published');
    },
  });

  useEffect(() => {
    if (focusBrief === null || !snapshot.data) return;
    document.getElementById(`brief-${focusBrief}`)?.scrollIntoView({ behavior: 'smooth' });
  }, [focusBrief, snapshot.data]);

  const data = snapshot.data;
  const proposals = data?.snapshot.proposals ?? [];
  const drafts = data?.snapshot.drafts ?? [];
  const adopted = proposals.filter((p) => p.kind === 'content_brief' && p.status === 'approved');
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Step 3 · Publish"
        title="초안 발행"
        description="채택한 기획안으로 AI가 장면별 대본과 캡션 초안을 씁니다. 가드가 데이터처럼 보이는 숫자를 막고, 마케터가 고쳐서 발행을 확정합니다."
        actions={
          data && (
            <SnapshotBadge
              generatedAt={data.snapshot.generatedAt}
              scenario={data.snapshot.scenario}
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
          <section aria-labelledby="adopted-briefs" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="adopted-briefs" className="text-base font-semibold">
                  채택한 기획안
                </h2>
                <p className="text-sm text-ink-600">
                  {data?.live?.claude.enabled
                    ? `Claude가 기획안과 Admin의 초안 지침으로 초안을 씁니다. 남은 실시간 호출: 나 ${data.live.claude.remainingForSession}회`
                    : '라이브 서버에서 Claude 키가 있으면 실시간으로, 없으면 템플릿으로 초안을 만듭니다.'}
                </p>
              </div>
              <ReviewerField reviewable={data?.reviewable ?? false} />
            </div>
            {adopted.length === 0 ? (
              <p className="rounded-square border border-dashed border-ink-300 bg-white px-6 py-8 text-center text-sm text-ink-600">
                아직 채택한 기획안이 없습니다.{' '}
                <Link to="/planning" className="font-semibold text-brand-700 hover:underline">
                  2단계 콘텐츠 기획에서 채택하기 →
                </Link>
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {adopted.map((brief) => {
                  const own = drafts.filter((d) => d.proposalId === brief.id);
                  const running = create.isPending && create.variables === brief.id;
                  return (
                    <li key={brief.id} id={`brief-${brief.id}`} className="scroll-mt-6">
                      <Card
                        className={cn(
                          'flex h-full flex-col gap-3 p-5',
                          focusBrief === brief.id && 'ring-2 ring-brand ring-offset-2',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Badge tone="positive">채택</Badge>
                          <span className="font-display text-xs text-ink-500">#{brief.id}</span>
                          {brief.plan && <Badge tone="muted">{brief.plan.format}</Badge>}
                        </div>
                        <div>
                          <p className="font-semibold">{brief.title}</p>
                          {brief.plan && (
                            <p className="mt-1 text-sm text-ink-600">훅: {brief.plan.hook}</p>
                          )}
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
                          <Button
                            size="sm"
                            disabled={!data?.reviewable || create.isPending}
                            onClick={() => create.mutate(brief.id)}
                          >
                            <PenLine aria-hidden className="size-3.5" />
                            {running
                              ? 'AI가 초안 작성 중…'
                              : own.length > 0
                                ? '초안 다시 만들기'
                                : 'AI 초안 만들기'}
                          </Button>
                          <span className="text-ink-600">초안 {own.length}개</span>
                          {running && <span className="text-brand-700">보통 10~30초</span>}
                        </div>
                        {create.isError && create.variables === brief.id && (
                          <p role="alert" className="text-xs text-burgundy">
                            {create.error.message}
                          </p>
                        )}
                        {create.data && create.variables === brief.id && !running && (
                          <p role="status" className="text-xs text-ink-600">
                            {create.data.live ? 'Claude 실시간' : '템플릿'} 초안 #
                            {create.data.draftId} · {Math.round(create.data.elapsedMs / 1000)}초
                            {create.data.fallbackReason && (
                              <span className="block text-tangerine-800">
                                대체 이유: {create.data.fallbackReason}
                              </span>
                            )}
                          </p>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="초안" className="space-y-3">
            <div
              role="tablist"
              aria-label="초안 상태"
              className="flex gap-1 rounded-square border border-ink-200 bg-white px-5 py-3"
            >
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
                  {label} <span className="tabular-nums">{drafts.filter(match).length}</span>
                </button>
              ))}
            </div>
            {drafts.filter((d) => current?.match(d) ?? true).length === 0 ? (
              <p className="rounded-square border border-dashed border-ink-300 bg-white px-6 py-8 text-center text-sm text-ink-600">
                해당하는 초안이 없습니다.
              </p>
            ) : (
              drafts
                .filter((d) => current?.match(d) ?? true)
                .map((draft) => (
                  <DraftCard
                    key={`${draft.id}:${draft.status}`}
                    draft={draft}
                    brief={proposals.find((p) => p.id === draft.proposalId) ?? null}
                    reviewable={data?.reviewable ?? false}
                    reviewer={reviewer}
                    pending={decide.isPending && decide.variables.id === draft.id}
                    error={
                      decide.isError && decide.variables.id === draft.id
                        ? decide.error.message
                        : null
                    }
                    onPublish={({ note, edits }) =>
                      decide.mutate({ id: draft.id, action: 'publish', note, edits })
                    }
                    onDiscard={(note) => decide.mutate({ id: draft.id, action: 'discard', note })}
                  />
                ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
