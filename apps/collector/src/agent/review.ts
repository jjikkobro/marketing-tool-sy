/**
 * 에이전트 루프: 관찰 → 제안 → 가드 → (사람의 결정) → 실행 → 기록
 *
 * 사람의 결정 없이 실행되는 경로는 없다. planAndGuard는 제안을 pending 또는 blocked로 저장할 뿐이다.
 * 실행은 approve()에서만 일어나고, approve는 사람(reviewer)의 이름을 요구한다.
 * MCP 서버에는 approve를 노출하지 않는다 (AI는 제안만 할 수 있고 승인할 수 없다).
 */
import type { SourceAdapter } from '../adapters/types.ts';
import type { Db } from '../db/database.ts';
import { runCollection, type RunOptions } from '../pipeline/run-collection.ts';
import type { CollectQuery, Proposal } from '../schema.ts';
import { verifyProposal, type GuardOptions } from './guard.ts';
import { buildObservation, factById } from './observation.ts';
import type { Planner } from './planners.ts';
import { getProposal, insertProposal, StaleProposalError, updateProposal } from './store.ts';

/** 승인된 제안을 실제 수집으로 바꿀 때 어떤 어댑터를 쓸지. 데모와 실서비스가 다르다. */
export type AdapterFactory = (adapterId: string, query: CollectQuery) => SourceAdapter;

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewError';
  }
}

/** 제안 하나를 가드에 통과시켜 저장한다. MCP 도구와 계획 사이클이 같은 함수를 쓴다. */
export function submitProposal(
  db: Db,
  raw: unknown,
  proposedBy: string,
  now: Date = new Date(),
  options: GuardOptions = {},
) {
  const observation = buildObservation(db, now);
  const result = verifyProposal(db, observation, raw, now, options);
  if (!result.draft) return { proposal: null, checks: result.checks };
  const proposal = insertProposal(db, result.draft, {
    status: result.passed ? 'pending' : 'blocked',
    checks: result.checks,
    proposedBy,
    now,
  });
  return { proposal, checks: result.checks };
}

/**
 * 계획 한 번. focus(마케터가 고른 레퍼런스)가 있으면:
 * - 고른 레퍼런스의 사실을 관찰에 넣고, 계획자에게 그것을 근거로 기획안만 쓰라고 알린다
 * - 기획안이 아닌 출력은 버린다 (마케터가 요청한 것은 기획이다)
 * - 가드는 고른 레퍼런스 중 하나 이상을 근거로 인용했는지 검사한다
 */
export async function planAndGuard(
  db: Db,
  planner: Planner,
  now: Date = new Date(),
  options: { focus?: readonly string[] } = {},
) {
  const observation = buildObservation(db, now);
  const focus = options.focus ?? [];
  if (focus.length > 0) {
    const known = new Set(observation.facts.map((fact) => fact.factId));
    for (const id of focus) {
      const fact = factById(db, id, now);
      if (!fact) throw new ReviewError(`레퍼런스 ${id}를 찾을 수 없습니다`);
      if (!known.has(id)) observation.facts.push(fact);
    }
    observation.focusReferences = [...focus];
  }
  const drafts = await planner.propose(observation);
  const relevant =
    focus.length > 0
      ? drafts.filter(
          (raw) =>
            typeof raw === 'object' &&
            raw !== null &&
            'kind' in raw &&
            raw.kind === 'content_brief',
        )
      : drafts;
  return relevant.map((raw) =>
    submitProposal(db, raw, planner.id, now, focus.length > 0 ? { requiredEvidence: focus } : {}),
  );
}

function requireReviewer(reviewer: string): string {
  const name = reviewer.trim();
  if (!name) throw new ReviewError('검토자 이름이 필요합니다');
  return name;
}

function requirePending(proposal: Proposal): void {
  if (proposal.status !== 'pending') {
    throw new ReviewError(
      `제안 #${proposal.id}은 ${proposal.status} 상태라 결정할 수 없습니다 (pending만 가능)`,
    );
  }
}

export function reject(
  db: Db,
  id: number,
  input: { reviewer: string; note: string; now?: Date },
): Proposal {
  requirePending(getProposal(db, id));
  if (!input.note.trim()) throw new ReviewError('거절 사유를 적어 주세요');
  return decided(() =>
    updateProposal(db, id, {
      from: 'pending',
      status: 'rejected',
      reviewer: requireReviewer(input.reviewer),
      reviewNote: input.note.trim(),
      reviewedAt: input.now ?? new Date(),
    }),
  );
}

export function acknowledge(
  db: Db,
  id: number,
  input: { reviewer: string; note?: string; now?: Date },
): Proposal {
  const proposal = getProposal(db, id);
  requirePending(proposal);
  if (proposal.kind !== 'operator_action') {
    throw new ReviewError('확인(acknowledge)은 운영 조치 제안에만 씁니다');
  }
  return decided(() =>
    updateProposal(db, id, {
      from: 'pending',
      status: 'acknowledged',
      reviewer: requireReviewer(input.reviewer),
      reviewNote: input.note?.trim() || null,
      reviewedAt: input.now ?? new Date(),
    }),
  );
}

/** 다른 프로세스가 먼저 결정한 경우를 검토자가 이해할 수 있는 오류로 바꾼다 */
function decided(update: () => Proposal): Proposal {
  try {
    return update();
  } catch (error) {
    if (error instanceof StaleProposalError) throw new ReviewError(error.message);
    throw error;
  }
}

/**
 * 승인하고 실행한다.
 *
 * 1. 승인 시점에 가드를 다시 돌린다. 제안이 만들어진 뒤 상황이 바뀌었을 수 있다
 *    (그사이 같은 쿼리가 수집됐거나, 쿼터가 찼거나, 대상 실행이 이미 재실행됨).
 * 2. 재검증과 pending → approved 전이를 한 트랜잭션에서 한다. 전이는 "아직 pending일 때만" 일어나므로
 *    두 곳에서 동시에 승인해도 한 번만 실행된다.
 * 3. 실행 오류는 execution_error에 따로 남긴다. 사람이 쓴 승인 사유는 그대로 둔다.
 */
export async function approve(
  db: Db,
  id: number,
  input: {
    reviewer: string;
    note?: string;
    now?: Date;
    adapterFor: AdapterFactory;
    runOptions?: RunOptions;
  },
): Promise<Proposal> {
  const proposal = getProposal(db, id);
  requirePending(proposal);
  if (proposal.kind === 'operator_action') {
    throw new ReviewError('운영 조치 제안은 실행할 것이 없습니다. 확인(acknowledge)을 쓰세요');
  }
  const reviewer = requireReviewer(input.reviewer);
  const now = input.now ?? new Date();

  const gate = db.transaction(() => {
    const recheck = verifyProposal(db, buildObservation(db, now), proposal, now, {
      excludeProposalId: id,
    });
    if (!recheck.passed) {
      return updateProposal(db, id, {
        from: 'pending',
        status: 'blocked',
        checks: recheck.checks,
        reviewer,
        reviewedAt: now,
        reviewNote: '승인 시점 재검증 실패',
      });
    }
    return updateProposal(db, id, {
      from: 'pending',
      status: 'approved',
      reviewer,
      reviewNote: input.note?.trim() || null,
      reviewedAt: now,
    });
  });
  const gated = decided(() => gate());
  // 기획안은 수집을 실행하지 않는다. 마케터가 채택하면 승인 상태로 남아 실행 백로그가 된다.
  if (gated.status !== 'approved' || proposal.kind === 'content_brief') return gated;

  try {
    const target = resolveTarget(db, proposal);
    const result = await runCollection(
      db,
      input.adapterFor(target.adapterId, target.query),
      target.query,
      {
        ...input.runOptions,
        now: () => now,
      },
    );
    return updateProposal(db, id, {
      from: 'approved',
      status: result.status === 'failed' ? 'failed' : 'executed',
      resultRunId: result.runId,
    });
  } catch (error) {
    return updateProposal(db, id, {
      from: 'approved',
      status: 'failed',
      executionError: error instanceof Error ? error.message : String(error),
    });
  }
}

function resolveTarget(db: Db, proposal: Proposal): { adapterId: string; query: CollectQuery } {
  if (
    proposal.kind === 'collect_query' &&
    proposal.adapterId &&
    proposal.queryKind &&
    proposal.queryValue
  ) {
    return {
      adapterId: proposal.adapterId,
      query: { kind: proposal.queryKind, value: proposal.queryValue },
    };
  }
  if (proposal.kind === 'retry_run' && proposal.runId !== null) {
    const run = db
      .prepare('SELECT adapter_id, query_kind, query_value FROM collection_run WHERE id = ?')
      .get(proposal.runId) as {
      adapter_id: string;
      query_kind: CollectQuery['kind'];
      query_value: string;
    };
    return { adapterId: run.adapter_id, query: { kind: run.query_kind, value: run.query_value } };
  }
  throw new ReviewError(`제안 #${proposal.id}의 실행 대상을 알 수 없습니다`);
}
