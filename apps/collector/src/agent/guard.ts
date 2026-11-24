/**
 * 가드: LLM 제안을 사람에게 보여주기 전에 결정적으로 검증한다.
 *
 * 원칙: LLM은 제안과 문장을 만들고, 숫자는 SQL이 만든다.
 * - 근거(evidence)는 관찰 사실 목록에 실제로 있는 factId여야 한다.
 * - 수치 주장(claims)은 그 사실의 SQL 값과 정확히 같아야 한다.
 * - 제목과 근거 문장에 쓴 숫자는 인용한 사실의 값 중 하나여야 한다. 숫자를 지어내 문장에 끼워 넣는 것을 막는다.
 * - 실행할 수 있는 제안인지(어댑터 기능, 실행 상태), 중복인지, API 쿼터를 넘지 않는지 확인한다.
 *
 * 하나라도 실패하면 제안은 blocked가 되고 사람에게 승인 요청이 가지 않는다.
 * 실패한 이유는 그대로 남겨, 어떤 종류의 할루시네이션이 얼마나 생기는지 집계할 수 있게 한다.
 */
import type { Db } from '../db/database.ts';
import type { Fact, GuardCheck, ProposalDraft, QueryKind } from '../schema.ts';
import { proposalDraftSchema } from '../schema.ts';
import { INSTAGRAM_HASHTAG_LIMIT, instagramHashtagsUsed, type Observation } from './observation.ts';

/** 에이전트가 실행을 제안할 수 있는 어댑터와 지원하는 쿼리 종류 */
export const AGENT_ADAPTERS: Record<string, readonly QueryKind[]> = {
  'tiktok-research': ['keyword', 'hashtag'],
  'instagram-graph': ['hashtag'],
};

const RECENT_COLLECTION_HOURS = 24;

export interface GuardResult {
  passed: boolean;
  checks: GuardCheck[];
}

/** 문장에서 숫자를 뽑는다. 해시태그(#4, #top10)와 실행 번호 표기(#12)는 숫자 주장이 아니므로 뺀다. */
export function extractNumbers(text: string): number[] {
  const withoutTags = text.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  return [...withoutTags.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) =>
    Number(m[0].replaceAll(',', '')),
  );
}

export function verifyProposal(
  db: Db,
  observation: Observation,
  raw: unknown,
  now: Date = new Date(),
): GuardResult & { draft: ProposalDraft | null } {
  const parsed = proposalDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      passed: false,
      draft: null,
      checks: [
        {
          check: 'schema',
          passed: false,
          detail: `형식 오류: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        },
      ],
    };
  }
  const draft = parsed.data;
  const facts = new Map<string, Fact>(observation.facts.map((fact) => [fact.factId, fact]));

  const checks: GuardCheck[] = [
    { check: 'schema', passed: true, detail: '형식 일치' },
    checkEvidence(draft, facts),
    checkClaims(draft, facts),
    checkGroundedNumbers(draft, facts),
    checkCapability(db, draft),
    checkDuplicate(db, draft, now),
    checkQuota(db, draft, now),
  ];
  return { passed: checks.every((c) => c.passed), checks, draft };
}

function checkEvidence(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  if (draft.evidence.length === 0) {
    return { check: 'evidence', passed: false, detail: '근거로 인용한 사실이 없습니다' };
  }
  const missing = draft.evidence.filter((id) => !facts.has(id));
  return missing.length === 0
    ? {
        check: 'evidence',
        passed: true,
        detail: `근거 ${draft.evidence.length}개 모두 관찰 사실에 있음`,
      }
    : { check: 'evidence', passed: false, detail: `관찰 사실에 없는 근거: ${missing.join(', ')}` };
}

function checkClaims(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  const problems: string[] = [];
  for (const claim of draft.claims) {
    if (!draft.evidence.includes(claim.factId)) {
      problems.push(`${claim.factId}는 근거 목록에 없음`);
      continue;
    }
    const actual = facts.get(claim.factId)?.values[claim.field];
    if (actual === undefined)
      problems.push(`${claim.factId}.${claim.field} 값이 없음 (주장 ${claim.value})`);
    else if (actual !== claim.value)
      problems.push(`${claim.factId}.${claim.field}: 주장 ${claim.value}, 실제 ${actual}`);
  }
  return problems.length === 0
    ? {
        check: 'claims',
        passed: true,
        detail: `수치 주장 ${draft.claims.length}개 모두 SQL 값과 일치`,
      }
    : { check: 'claims', passed: false, detail: problems.join(' / ') };
}

function checkGroundedNumbers(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  const allowed = new Set<number>(
    draft.evidence.flatMap((id) => Object.values(facts.get(id)?.values ?? {})),
  );
  const ungrounded = extractNumbers(`${draft.title} ${draft.rationale}`).filter(
    (n) => !allowed.has(n),
  );
  return ungrounded.length === 0
    ? { check: 'grounded_numbers', passed: true, detail: '문장 속 숫자가 모두 근거 사실의 값' }
    : {
        check: 'grounded_numbers',
        passed: false,
        detail: `근거에 없는 숫자: ${[...new Set(ungrounded)].join(', ')}`,
      };
}

function checkCapability(db: Db, draft: ProposalDraft): GuardCheck {
  const fail = (detail: string): GuardCheck => ({ check: 'capability', passed: false, detail });

  if (draft.kind === 'collect_query') {
    if (!draft.adapterId || !draft.queryKind || !draft.queryValue?.trim()) {
      return fail('수집 제안에는 어댑터, 쿼리 종류, 쿼리 값이 모두 있어야 합니다');
    }
    const supported = AGENT_ADAPTERS[draft.adapterId];
    if (!supported) return fail(`에이전트가 실행할 수 없는 어댑터: ${draft.adapterId}`);
    if (!supported.includes(draft.queryKind)) {
      return fail(
        `${draft.adapterId}는 ${draft.queryKind} 검색을 지원하지 않습니다 (지원: ${supported.join(', ')})`,
      );
    }
    return {
      check: 'capability',
      passed: true,
      detail: `${draft.adapterId}로 ${draft.queryKind} 수집 가능`,
    };
  }

  if (draft.kind === 'retry_run') {
    if (draft.runId === null) return fail('재실행 제안에는 실행 번호가 있어야 합니다');
    const run = db
      .prepare(
        'SELECT adapter_id, query_kind, query_value, status FROM collection_run WHERE id = ?',
      )
      .get(draft.runId) as
      { adapter_id: string; query_kind: string; query_value: string; status: string } | undefined;
    if (!run) return fail(`실행 #${draft.runId}이 없습니다`);
    if (run.status !== 'partial' && run.status !== 'failed') {
      return fail(`실행 #${draft.runId}은 ${run.status} 상태라 재실행할 이유가 없습니다`);
    }
    const laterSuccess = db
      .prepare(
        `SELECT id FROM collection_run
          WHERE adapter_id = ? AND query_kind = ? AND query_value = ? AND id > ? AND status = 'succeeded'
          ORDER BY id LIMIT 1`,
      )
      .get(run.adapter_id, run.query_kind, run.query_value, draft.runId) as
      { id: number } | undefined;
    if (laterSuccess)
      return fail(`같은 쿼리가 이후 실행 #${laterSuccess.id}에서 이미 성공했습니다`);
    if (!AGENT_ADAPTERS[run.adapter_id])
      return fail(`${run.adapter_id} 실행은 에이전트가 재실행할 수 없습니다`);
    return {
      check: 'capability',
      passed: true,
      detail: `실행 #${draft.runId}(${run.status}) 재실행 가능`,
    };
  }

  // operator_action은 실행하지 않고 사람에게 알리기만 한다
  return draft.adapterId || draft.queryValue
    ? fail('운영 조치 제안에는 실행 대상(어댑터·쿼리)을 넣지 않습니다')
    : { check: 'capability', passed: true, detail: '실행 없이 사람의 확인만 필요한 제안' };
}

function checkDuplicate(db: Db, draft: ProposalDraft, now: Date): GuardCheck {
  const open = db
    .prepare(
      `SELECT id FROM agent_proposal
        WHERE status IN ('pending', 'approved') AND kind = ?
          AND COALESCE(adapter_id, '') = COALESCE(?, '') AND COALESCE(lower(query_value), '') = COALESCE(lower(?), '')
          AND COALESCE(run_id, -1) = COALESCE(?, -1)
          AND (kind <> 'operator_action' OR title = ?)`,
    )
    .get(draft.kind, draft.adapterId, draft.queryValue, draft.runId, draft.title) as
    { id: number } | undefined;
  if (open)
    return {
      check: 'duplicate',
      passed: false,
      detail: `같은 내용의 제안 #${open.id}이 이미 검토 중입니다`,
    };

  if (draft.kind === 'collect_query' && draft.adapterId && draft.queryValue) {
    const since = new Date(now.getTime() - RECENT_COLLECTION_HOURS * 3_600_000).toISOString();
    const recent = db
      .prepare(
        `SELECT id FROM collection_run
          WHERE adapter_id = ? AND query_kind = ? AND lower(query_value) = lower(?) AND started_at >= ?
          ORDER BY id DESC LIMIT 1`,
      )
      .get(draft.adapterId, draft.queryKind, draft.queryValue, since) as { id: number } | undefined;
    if (recent) {
      return {
        check: 'duplicate',
        passed: false,
        detail: `최근 ${RECENT_COLLECTION_HOURS}시간 안에 같은 쿼리를 수집했습니다 (실행 #${recent.id})`,
      };
    }
  }
  return { check: 'duplicate', passed: true, detail: '검토 중인 같은 제안이나 최근 수집 없음' };
}

function checkQuota(db: Db, draft: ProposalDraft, now: Date): GuardCheck {
  if (
    draft.kind !== 'collect_query' ||
    draft.adapterId !== 'instagram-graph' ||
    !draft.queryValue
  ) {
    return { check: 'quota', passed: true, detail: '해당 없음' };
  }
  const used = new Set(instagramHashtagsUsed(db, now));
  const tag = draft.queryValue.replace(/^#/, '').toLowerCase();
  const after = used.has(tag) ? used.size : used.size + 1;
  return after <= INSTAGRAM_HASHTAG_LIMIT
    ? {
        check: 'quota',
        passed: true,
        detail: `Instagram 해시태그 ${after}/${INSTAGRAM_HASHTAG_LIMIT} (7일)`,
      }
    : {
        check: 'quota',
        passed: false,
        detail: `Instagram 7일 해시태그 한도 초과 (${after}/${INSTAGRAM_HASHTAG_LIMIT})`,
      };
}
