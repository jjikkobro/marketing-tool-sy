import type { Db } from '../db/database.ts';
import type { GuardCheck, Proposal, ProposalDraft, ProposalStatus } from '../schema.ts';

interface ProposalRow {
  id: number;
  kind: Proposal['kind'];
  status: ProposalStatus;
  title: string;
  rationale: string;
  adapter_id: string | null;
  query_kind: Proposal['queryKind'];
  query_value: string | null;
  run_id: number | null;
  evidence: string;
  claims: string;
  checks: string;
  proposed_by: string;
  created_at: string;
  reviewer: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  result_run_id: number | null;
  execution_error: string | null;
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    rationale: row.rationale,
    adapterId: row.adapter_id,
    queryKind: row.query_kind,
    queryValue: row.query_value,
    runId: row.run_id,
    evidence: JSON.parse(row.evidence) as string[],
    claims: JSON.parse(row.claims) as Proposal['claims'],
    checks: JSON.parse(row.checks) as GuardCheck[],
    proposedBy: row.proposed_by,
    createdAt: row.created_at,
    reviewer: row.reviewer,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    resultRunId: row.result_run_id,
    executionError: row.execution_error,
  };
}

export function insertProposal(
  db: Db,
  draft: ProposalDraft,
  meta: { status: 'pending' | 'blocked'; checks: GuardCheck[]; proposedBy: string; now: Date },
): Proposal {
  const result = db
    .prepare(
      `INSERT INTO agent_proposal (kind, status, title, rationale, adapter_id, query_kind, query_value, run_id,
                                   evidence, claims, checks, proposed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      draft.kind,
      meta.status,
      draft.title,
      draft.rationale,
      draft.adapterId,
      draft.queryKind,
      draft.queryValue,
      draft.runId,
      JSON.stringify(draft.evidence),
      JSON.stringify(draft.claims),
      JSON.stringify(meta.checks),
      meta.proposedBy,
      meta.now.toISOString(),
    );
  return getProposal(db, Number(result.lastInsertRowid));
}

export function getProposal(db: Db, id: number): Proposal {
  const row = db.prepare('SELECT * FROM agent_proposal WHERE id = ?').get(id) as
    ProposalRow | undefined;
  if (!row) throw new Error(`제안 #${id}이 없습니다`);
  return toProposal(row);
}

export function listProposals(
  db: Db,
  { status, limit = 100 }: { status?: ProposalStatus; limit?: number } = {},
): Proposal[] {
  const rows = db
    .prepare(
      `SELECT * FROM agent_proposal WHERE (:status IS NULL OR status = :status) ORDER BY id DESC LIMIT :limit`,
    )
    .all({ status: status ?? null, limit }) as ProposalRow[];
  return rows.map(toProposal);
}

export class StaleProposalError extends Error {
  constructor(id: number, expected: ProposalStatus) {
    super(`제안 #${id}이 이미 다른 곳에서 처리되었습니다 (${expected} 상태가 아님)`);
    this.name = 'StaleProposalError';
  }
}

/**
 * 상태 전이. from을 주면 "현재 상태가 from일 때만" 바꾼다 (조건부 UPDATE).
 * 두 프로세스가 같은 제안을 동시에 승인해도 한쪽만 성공한다.
 */
export function updateProposal(
  db: Db,
  id: number,
  change: {
    from?: ProposalStatus;
    status: ProposalStatus;
    reviewer?: string;
    reviewNote?: string | null;
    reviewedAt?: Date;
    resultRunId?: number | null;
    executionError?: string | null;
    checks?: GuardCheck[];
  },
): Proposal {
  const result = db
    .prepare(
      `UPDATE agent_proposal
          SET status = :status,
              reviewer = COALESCE(:reviewer, reviewer),
              review_note = COALESCE(:reviewNote, review_note),
              reviewed_at = COALESCE(:reviewedAt, reviewed_at),
              result_run_id = COALESCE(:resultRunId, result_run_id),
              execution_error = COALESCE(:executionError, execution_error),
              checks = COALESCE(:checks, checks)
        WHERE id = :id AND (:from IS NULL OR status = :from)`,
    )
    .run({
      id,
      from: change.from ?? null,
      status: change.status,
      reviewer: change.reviewer ?? null,
      reviewNote: change.reviewNote ?? null,
      reviewedAt: change.reviewedAt?.toISOString() ?? null,
      resultRunId: change.resultRunId ?? null,
      executionError: change.executionError ?? null,
      checks: change.checks ? JSON.stringify(change.checks) : null,
    });
  if (result.changes === 0) {
    if (change.from) throw new StaleProposalError(id, change.from);
    throw new Error(`제안 #${id}이 없습니다`);
  }
  return getProposal(db, id);
}
