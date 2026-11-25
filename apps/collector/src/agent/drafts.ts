/**
 * 콘텐츠 초안: 마케터가 채택한 기획안 → AI 초안 → 가드 → 마케터의 수정·발행 결정.
 *
 * - 초안은 채택(approved)된 기획안에서만 만든다. 사람이 고르지 않은 기획으로 글을 쓰지 않는다.
 * - LLM 초안도 기획안과 같은 숫자 규칙을 거친다 (guard.ts specNumberProblems).
 * - 발행은 "최종본 확정"이다. 이 저장소는 실제 SNS에 게시하지 않는다 (승인 없는 외부 실행 경로를 만들지 않는다).
 * - 사람이 고친 본문도 발행 직전에 같은 검사를 다시 한다. 검증하지 않은 수치가 최종본에 들어가지 않게 하기 위해서다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Db } from '../db/database.ts';
import {
  draftBodySchema,
  type ContentDraft,
  type DraftBody,
  type DraftCheck,
  type DraftStatus,
  type Fact,
  type Proposal,
} from '../schema.ts';
import { activeGuidelines } from './config.ts';
import { specNumberProblems } from './guard.ts';
import { factById } from './observation.ts';
import { DRAFTER_RULES, withGuidelines } from './prompts.ts';
import { ReviewError } from './review.ts';
import { getProposal } from './store.ts';

export interface DraftInput {
  brief: Proposal;
  facts: Fact[];
  guidelines: string;
}

export interface Drafter {
  /** 초안 기록의 drafted_by에 남는 이름 */
  readonly id: string;
  draft(input: DraftInput): Promise<unknown>;
}

const HASHTAG = /^[\p{L}\p{N}_]+$/u;

/* ── 작성자 ─────────────────────────────────────────────────────── */

const drafterOutputSchema = z.object({
  title: z.string(),
  script: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export function claudeDrafter(
  options: { client?: Anthropic; model?: string; effort?: 'low' | 'medium' | 'high' } = {},
): Drafter {
  const client = options.client ?? new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const model = options.model ?? 'claude-opus-5-5';
  return {
    id: `claude:${model}`,
    async draft({ brief, facts, guidelines }) {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: options.effort ?? 'medium',
          format: betaZodOutputFormat(drafterOutputSchema),
        },
        system: withGuidelines(DRAFTER_RULES, guidelines),
        messages: [
          {
            role: 'user',
            content: `채택된 기획안:\n${JSON.stringify({
              title: brief.title,
              rationale: brief.rationale,
              plan: brief.plan,
            })}\n\nfacts:\n${JSON.stringify(facts.map((f) => ({ factId: f.factId, description: f.description })))}\n\nclaims:\n${JSON.stringify(brief.claims)}`,
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new Error('초안 요청이 거절되었습니다');
      if (!response.parsed_output) throw new Error('초안 응답을 해석하지 못했습니다');
      return response.parsed_output;
    },
  };
}

/**
 * 키 없이 쓰는 템플릿 작성자. 기획안의 문장을 장면 틀에 옮길 뿐 새 내용을 만들지 않는다.
 * 녹화 데모와 Claude 예산 초과 시 대체용이며, 화면에 "템플릿 초안"으로 표시된다.
 */
export function templateDrafter(): Drafter {
  return {
    id: 'template',
    async draft({ brief }) {
      const plan = brief.plan;
      if (!plan) throw new Error('기획안에 plan이 없습니다');
      const tags = brief.evidence
        .filter((id) => id.startsWith('hashtag:') || id.startsWith('format:'))
        .map((id) => id.slice(id.indexOf(':') + 1).replaceAll(/[^\p{L}\p{N}_]/gu, ''))
        .filter(Boolean);
      return {
        title: brief.title.slice(0, 80),
        script: [
          `장면 1 — ${plan.hook}`,
          `장면 2 — ${plan.deliverable}`,
          '장면 3 — 마무리: 시청자에게 다음 도전을 묻는 자막',
        ].join('\n'),
        caption:
          `${plan.hook} 여러분이라면 어떻게 하실 건가요?${plan.brandRisk ? ` (${plan.brandRisk})` : ''}`.slice(
            0,
            600,
          ),
        hashtags: [...new Set(tags)].slice(0, 10),
      };
    },
  };
}

/* ── 검증 ───────────────────────────────────────────────────────── */

export function verifyDraft(
  raw: unknown,
  brief: Proposal,
): { body: DraftBody | null; checks: DraftCheck[]; passed: boolean } {
  const parsed = draftBodySchema.safeParse(raw);
  if (!parsed.success) {
    const checks: DraftCheck[] = [
      {
        check: 'schema',
        passed: false,
        detail: `형식 오류: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`,
      },
    ];
    return { body: null, checks, passed: false };
  }
  const body = {
    ...parsed.data,
    hashtags: parsed.data.hashtags.map((tag) => tag.replace(/^#/, '')),
  };
  const allowed = new Set(brief.claims.map((claim) => claim.value));
  const numberProblems = [
    ...specNumberProblems(body.title, allowed, '제목'),
    ...specNumberProblems(body.script, allowed, '대본'),
    ...specNumberProblems(body.caption, allowed, '캡션'),
  ];
  const badTags = body.hashtags.filter((tag) => !HASHTAG.test(tag));
  const duplicated =
    body.hashtags.length !== new Set(body.hashtags.map((t) => t.toLowerCase())).size;

  const checks: DraftCheck[] = [
    { check: 'schema', passed: true, detail: '형식 일치' },
    numberProblems.length === 0
      ? { check: 'grounded_numbers', passed: true, detail: '데이터처럼 보이는 숫자 없음' }
      : { check: 'grounded_numbers', passed: false, detail: numberProblems.join(' · ') },
    badTags.length > 0
      ? { check: 'hashtags', passed: false, detail: `쓸 수 없는 해시태그: ${badTags.join(', ')}` }
      : duplicated
        ? { check: 'hashtags', passed: false, detail: '같은 해시태그가 두 번 들어 있습니다' }
        : { check: 'hashtags', passed: true, detail: `해시태그 ${body.hashtags.length}개` },
  ];
  return { body, checks, passed: checks.every((c) => c.passed) };
}

/* ── 저장과 결정 ────────────────────────────────────────────────── */

interface DraftRow {
  id: number;
  proposal_id: number;
  status: DraftStatus;
  title: string;
  script: string;
  caption: string;
  hashtags: string;
  checks: string;
  drafted_by: string;
  created_at: string;
  edited_by: string | null;
  reviewer: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

function toDraft(row: DraftRow): ContentDraft {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    status: row.status,
    title: row.title,
    script: row.script,
    caption: row.caption,
    hashtags: JSON.parse(row.hashtags) as string[],
    checks: JSON.parse(row.checks) as DraftCheck[],
    draftedBy: row.drafted_by,
    createdAt: row.created_at,
    editedBy: row.edited_by,
    reviewer: row.reviewer,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
  };
}

export function getDraft(db: Db, id: number): ContentDraft {
  const row = db.prepare('SELECT * FROM content_draft WHERE id = ?').get(id) as
    DraftRow | undefined;
  if (!row) throw new ReviewError(`초안 #${id}이 없습니다`);
  return toDraft(row);
}

export function listDrafts(db: Db): ContentDraft[] {
  return (db.prepare('SELECT * FROM content_draft ORDER BY id DESC').all() as DraftRow[]).map(
    toDraft,
  );
}

function adoptedBrief(db: Db, proposalId: number): Proposal {
  let brief: Proposal;
  try {
    brief = getProposal(db, proposalId);
  } catch {
    throw new ReviewError(`기획안 #${proposalId}이 없습니다`);
  }
  if (brief.kind !== 'content_brief' || brief.status !== 'approved' || !brief.plan) {
    throw new ReviewError(`#${proposalId}은 채택된 기획안이 아니라 초안을 만들 수 없습니다`);
  }
  return brief;
}

/** 채택된 기획안으로 초안을 쓰고 가드를 거쳐 저장한다. 통과하지 못하면 blocked로 남긴다 (이유를 보여주기 위해). */
export async function createDraft(
  db: Db,
  proposalId: number,
  drafter: Drafter,
  now: Date = new Date(),
): Promise<ContentDraft> {
  const brief = adoptedBrief(db, proposalId);
  const guidelines = activeGuidelines(db, 'draft_guidelines');
  const facts = brief.evidence.flatMap((id) => {
    const fact = factById(db, id, now);
    return fact ? [fact] : [];
  });
  const raw = await drafter.draft({ brief, facts, guidelines: guidelines.value });
  const { body, checks, passed } = verifyDraft(raw, brief);
  const stored = body ?? { title: brief.title.slice(0, 80), script: '', caption: '', hashtags: [] };
  const result = db
    .prepare(
      `INSERT INTO content_draft (proposal_id, status, title, script, caption, hashtags, checks, drafted_by,
                                  guidelines_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      proposalId,
      passed ? 'draft' : 'blocked',
      stored.title,
      stored.script,
      stored.caption,
      JSON.stringify(stored.hashtags),
      JSON.stringify(checks),
      drafter.id,
      guidelines.versionId,
      now.toISOString(),
    );
  return getDraft(db, Number(result.lastInsertRowid));
}

const publishSchema = z.object({
  reviewer: z.string().trim().min(1, '검토자 이름이 필요합니다').max(60),
  note: z.string().trim().max(500).optional(),
  /** 마케터가 고친 본문. 없으면 초안 그대로 발행한다 */
  edits: draftBodySchema.partial().optional(),
});

/** 마케터가 최종본으로 확정한다. 고친 본문도 같은 검사를 통과해야 한다. */
export function publishDraft(
  db: Db,
  id: number,
  input: unknown,
  now: Date = new Date(),
): ContentDraft {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) throw new ReviewError(parsed.error.issues[0]?.message ?? '잘못된 요청');
  const { reviewer, note, edits } = parsed.data;
  const current = getDraft(db, id);
  if (current.status !== 'draft') {
    throw new ReviewError(`초안 #${id}은 ${current.status} 상태라 발행할 수 없습니다`);
  }
  const next: DraftBody = {
    title: edits?.title ?? current.title,
    script: edits?.script ?? current.script,
    caption: edits?.caption ?? current.caption,
    hashtags: edits?.hashtags ?? current.hashtags,
  };
  const edited =
    next.title !== current.title ||
    next.script !== current.script ||
    next.caption !== current.caption ||
    JSON.stringify(next.hashtags) !== JSON.stringify(current.hashtags);
  const brief = getProposal(db, current.proposalId);
  const verified = verifyDraft(next, brief);
  if (!verified.passed || !verified.body) {
    const reasons = verified.checks.filter((c) => !c.passed).map((c) => c.detail);
    throw new ReviewError(`고친 본문이 검사를 통과하지 못했습니다: ${reasons.join(' · ')}`);
  }
  const body = verified.body;
  // 조건부 UPDATE: 동시에 두 번 발행해도 한 번만 성공한다
  const changed = db
    .prepare(
      `UPDATE content_draft
          SET status = 'published', title = ?, script = ?, caption = ?, hashtags = ?, checks = ?,
              edited_by = ?, reviewer = ?, review_note = ?, reviewed_at = ?
        WHERE id = ? AND status = 'draft'`,
    )
    .run(
      body.title,
      body.script,
      body.caption,
      JSON.stringify(body.hashtags),
      JSON.stringify(verified.checks),
      edited ? reviewer : current.editedBy,
      reviewer,
      note ?? null,
      now.toISOString(),
      id,
    ).changes;
  if (changed === 0) throw new ReviewError(`초안 #${id}이 이미 처리되었습니다`);
  return getDraft(db, id);
}

const discardSchema = z.object({
  reviewer: z.string().trim().min(1, '검토자 이름이 필요합니다').max(60),
  note: z.string().trim().min(1, '버리는 이유를 적어 주세요').max(500),
});

export function discardDraft(
  db: Db,
  id: number,
  input: unknown,
  now: Date = new Date(),
): ContentDraft {
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) throw new ReviewError(parsed.error.issues[0]?.message ?? '잘못된 요청');
  const changed = db
    .prepare(
      `UPDATE content_draft SET status = 'discarded', reviewer = ?, review_note = ?, reviewed_at = ?
        WHERE id = ? AND status IN ('draft', 'blocked')`,
    )
    .run(parsed.data.reviewer, parsed.data.note, now.toISOString(), id).changes;
  if (changed === 0) throw new ReviewError(`초안 #${id}은 버릴 수 있는 상태가 아닙니다`);
  return getDraft(db, id);
}
