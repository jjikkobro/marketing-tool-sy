import type { Proposal } from '@studio/collector/schema';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Decision } from '../../api/snapshot';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { formatKst } from '../../lib/format';
import { guardCheckLabel, proposalKindLabel, proposalStatusMeta } from './labels';

interface ProposalCardProps {
  proposal: Proposal;
  reviewable: boolean;
  /** 방금 받은 제안이면 강조한다 */
  fresh?: boolean;
  reviewer: string;
  pending: boolean;
  error: string | null;
  onDecide: (decision: Decision, note: string) => void;
}

export function ProposalCard({
  proposal,
  reviewable,
  fresh = false,
  reviewer,
  pending,
  error,
  onDecide,
}: ProposalCardProps) {
  const status = proposalStatusMeta[proposal.status];
  const failed = proposal.checks.filter((c) => !c.passed);

  return (
    <Card
      className={cn(
        'p-6',
        proposal.status === 'pending' && 'border-brand/40',
        fresh && 'ring-2 ring-brand ring-offset-2',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone="muted">{proposalKindLabel[proposal.kind]}</Badge>
            <ProposerBadge proposedBy={proposal.proposedBy} />
            {fresh && <Badge tone="brand">방금 받은 제안</Badge>}
            <span className="font-display text-xs text-ink-500">#{proposal.id}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold">{proposal.title}</h3>
          <p className="mt-1 text-sm text-ink-600">{proposal.rationale}</p>
        </div>
        <Target proposal={proposal} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-label="근거와 수치 주장">
          <p className="text-xs font-semibold">근거 · 수치 주장</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {proposal.evidence.map((id) => (
              <li
                key={id}
                className="rounded-full border border-ink-200 px-2.5 py-0.5 font-mono text-[11px] text-ink-600"
              >
                {id}
              </li>
            ))}
          </ul>
          {proposal.claims.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {proposal.claims.map((claim) => (
                <li key={`${claim.factId}.${claim.field}`} className="font-mono text-ink-600">
                  {claim.factId}.{claim.field} ={' '}
                  <span className="text-charcoal">{claim.value.toLocaleString('ko-KR')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="가드 검사">
          <p className="text-xs font-semibold">
            가드 검사 {proposal.checks.length - failed.length}/{proposal.checks.length}
          </p>
          <ul className="mt-2 space-y-1">
            {proposal.checks.map((check) => (
              <li key={check.check} className="flex gap-2 text-xs">
                {check.passed ? (
                  <Check aria-label="통과" className="mt-px size-3.5 shrink-0 text-positive" />
                ) : (
                  <X aria-label="실패" className="mt-px size-3.5 shrink-0 text-burgundy" />
                )}
                <span
                  className={cn(
                    'w-20 shrink-0',
                    check.passed ? 'text-ink-600' : 'font-semibold text-burgundy',
                  )}
                >
                  {guardCheckLabel[check.check]}
                </span>
                <span className={check.passed ? 'text-ink-500' : 'text-charcoal'}>
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-600">
        <p>
          제안: <span className="font-mono">{proposal.proposedBy}</span> ·{' '}
          {formatKst(proposal.createdAt)}
        </p>
        {proposal.status === 'pending' ? (
          <DecisionForm
            proposal={proposal}
            reviewable={reviewable}
            reviewer={reviewer}
            pending={pending}
            error={error}
            onDecide={onDecide}
          />
        ) : (
          <DecisionRecord proposal={proposal} />
        )}
      </footer>
    </Card>
  );
}

function Target({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === 'collect_query' && proposal.adapterId) {
    return (
      <p className="rounded-square bg-ink-50 px-3 py-2 font-mono text-xs">
        {proposal.adapterId}
        <br />
        {proposal.queryKind}: {proposal.queryValue}
      </p>
    );
  }
  if (proposal.kind === 'retry_run' && proposal.runId !== null) {
    return (
      <Link
        to="/operations"
        className="rounded-square bg-ink-50 px-3 py-2 text-xs hover:text-brand-700"
      >
        실행 <span className="font-mono">#{proposal.runId}</span> 재실행
      </Link>
    );
  }
  return null;
}

function DecisionRecord({ proposal }: { proposal: Proposal }) {
  if (proposal.status === 'blocked') {
    return (
      <p className="mt-1 text-burgundy">
        가드를 통과하지 못해 사람에게 승인 요청이 가지 않았습니다.
      </p>
    );
  }
  return (
    <p className="mt-1">
      결정: <span className="font-semibold text-charcoal">{proposal.reviewer}</span> ·{' '}
      {formatKst(proposal.reviewedAt)}
      {proposal.reviewNote && <> · “{proposal.reviewNote}”</>}
      {proposal.executionError && (
        <span className="block text-burgundy">실행 오류: {proposal.executionError}</span>
      )}
      {proposal.resultRunId !== null && (
        <>
          {' '}
          →{' '}
          <Link to="/operations" className="font-semibold text-brand-700 hover:underline">
            실행 #{proposal.resultRunId}
          </Link>
        </>
      )}
    </p>
  );
}

function DecisionForm({
  proposal,
  reviewable,
  reviewer,
  pending,
  error,
  onDecide,
}: Omit<ProposalCardProps, 'proposal'> & { proposal: Proposal }) {
  const [note, setNote] = useState('');

  if (!reviewable) {
    return (
      <p className="mt-2 rounded-square bg-sand-50 px-3 py-2 text-charcoal">
        이 화면은 정적 스냅샷이라 결정할 수 없습니다. 라이브 서버에서 열면 승인·거절할 수 있습니다.
      </p>
    );
  }

  const noReviewer = reviewer.trim() === '';
  const operator = proposal.kind === 'operator_action';

  return (
    <div className="mt-3 space-y-2">
      <label className="sr-only" htmlFor={`note-${proposal.id}`}>
        결정 사유
      </label>
      <textarea
        id={`note-${proposal.id}`}
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={operator ? '조치 내용 (선택)' : '결정 사유 (거절할 때는 필수)'}
        className="w-full rounded-square border border-ink-300 px-3 py-2 text-sm text-charcoal placeholder:text-ink-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        {operator ? (
          <Button size="sm" disabled={pending || noReviewer} onClick={() => onDecide('ack', note)}>
            확인함
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={pending || noReviewer}
              onClick={() => onDecide('approve', note)}
            >
              승인하고 실행
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || noReviewer || note.trim() === ''}
              onClick={() => onDecide('reject', note)}
            >
              거절
            </Button>
          </>
        )}
        {noReviewer && <span className="text-ink-600">검토자 이름을 먼저 입력하세요</span>}
        {error && (
          <span role="alert" className="text-burgundy">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** 누가 제안했는지: 실시간 Claude, 녹화 응답, 외부 MCP 클라이언트 */
function ProposerBadge({ proposedBy }: { proposedBy: string }) {
  if (proposedBy.startsWith('claude:')) return <Badge tone="positive">Claude 실시간</Badge>;
  if (proposedBy.startsWith('recorded:')) return <Badge tone="muted">녹화 응답</Badge>;
  if (proposedBy === 'mcp-client') return <Badge tone="neutral">MCP 클라이언트</Badge>;
  return <Badge tone="muted">{proposedBy}</Badge>;
}
