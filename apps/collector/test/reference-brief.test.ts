/**
 * 레퍼런스 기반 기획: 마케터가 레퍼런스 화면에서 고른 콘텐츠로 기획안을 만든다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { verifyProposal } from '../src/agent/guard.ts';
import { buildObservation, factById } from '../src/agent/observation.ts';
import type { Planner } from '../src/agent/planners.ts';
import { claudePlanner, RECORDED_PROPOSALS } from '../src/agent/planners.ts';
import { referenceTemplatePlanner } from '../src/agent/reference-brief.ts';
import { planAndGuard, ReviewError } from '../src/agent/review.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { searchContents } from '../src/queries/index.ts';
import { referenceBriefRequestSchema, referenceFactId } from '../src/schema.ts';

const now = new Date('2026-11-24T03:00:00Z');

async function seeded(): Promise<{ db: Db; refs: string[] }> {
  const db = openDatabase(':memory:');
  await runScenario(db, 'failures', { now });
  const refs = searchContents(db, { platform: 'tiktok', limit: 2 }).map(referenceFactId);
  return { db, refs };
}

const brief = RECORDED_PROPOSALS.find((p) => p.kind === 'content_brief');

describe('레퍼런스 기반 기획', () => {
  it('고른 레퍼런스는 DB에서 계산한 사실이 된다 (지표는 받은 값만)', async () => {
    const { db, refs } = await seeded();
    const fact = factById(db, refs[0] ?? '', now);
    expect(fact?.factId).toMatch(/^content:tiktok:/);
    expect(fact?.description).toContain('규칙 분류 포맷');
    expect(fact?.values.views).toBeGreaterThan(0);
    expect(factById(db, 'content:tiktok:does-not-exist', now)).toBeNull();
  });

  it('키 없는 템플릿 계획자: 고른 레퍼런스와 포맷을 근거로 기획안을 만들고 가드를 통과한다', async () => {
    const { db, refs } = await seeded();
    const results = await planAndGuard(db, referenceTemplatePlanner(db), now, { focus: refs });
    expect(results).toHaveLength(1);
    const proposal = results[0]?.proposal;
    expect(proposal?.status).toBe('pending');
    expect(proposal?.kind).toBe('content_brief');
    expect(proposal?.evidence).toEqual(expect.arrayContaining(refs));
  });

  it('고른 레퍼런스를 인용하지 않은 기획안은 막고, 기획안이 아닌 출력은 버린다', async () => {
    const { db, refs } = await seeded();
    if (!brief) throw new Error('녹화 기획안이 없습니다');
    const planner: Planner = {
      id: 'test',
      propose: async () => [brief, { ...brief, kind: 'operator_action', plan: null }],
    };
    const results = await planAndGuard(db, planner, now, { focus: refs });
    expect(results).toHaveLength(1);
    expect(results[0]?.proposal?.status).toBe('blocked');
    expect(results[0]?.checks.find((c) => c.check === 'target')).toMatchObject({
      passed: false,
      detail: expect.stringContaining('고른 레퍼런스'),
    });
  });

  it('근거 레퍼런스의 작성자 핸들 속 숫자는 허용하고, 떼어 쓴 숫자는 막는다 (0002 §12)', async () => {
    const { db } = await seeded();
    const content = searchContents(db, { platform: 'tiktok', limit: 50 }).find((c) =>
      /\d/.test(c.creatorHandle ?? ''),
    );
    if (!content?.creatorHandle || !brief) throw new Error('숫자가 든 핸들이 없습니다');
    const ref = referenceFactId(content);
    const handle = content.creatorHandle;
    const digits = handle.replace(/\D/g, '');
    const draft = (rationale: string, evidence: string[]) => ({ ...brief, rationale, evidence });
    const failed = (rationale: string, evidence: string[]) =>
      verifyProposal(db, buildObservation(db, now), draft(rationale, evidence), now)
        .checks.filter((c) => !c.passed)
        .map((c) => c.check);

    const evidence = [...brief.evidence, ref];
    expect(failed(`${handle}의 게시물 구성을 참고합니다.`, evidence)).toEqual([]);
    // 핸들의 숫자를 떼어 데이터처럼 쓰면 막는다
    expect(failed(`${handle}의 게시물은 조회 ${digits}회입니다.`, evidence)).toContain(
      'grounded_numbers',
    );
    // 그 레퍼런스를 근거로 인용하지 않았으면 핸들도 검증할 수 없다
    expect(failed(`${handle}의 게시물 구성을 참고합니다.`, brief.evidence)).toContain(
      'grounded_numbers',
    );
  });

  it('없는 레퍼런스와 잘못된 요청은 거부한다', async () => {
    const { db } = await seeded();
    await expect(
      planAndGuard(db, referenceTemplatePlanner(db), now, { focus: ['content:tiktok:nope'] }),
    ).rejects.toThrow(ReviewError);
    expect(referenceBriefRequestSchema.safeParse({ references: [] }).success).toBe(false);
    expect(referenceBriefRequestSchema.safeParse({ references: ['run:1'] }).success).toBe(false);
    expect(
      referenceBriefRequestSchema.safeParse({ references: Array(6).fill('content:tiktok:1') })
        .success,
    ).toBe(false);
  });

  it('Claude 요청에는 고른 레퍼런스와 "기획안만" 지시가 들어간다', async () => {
    const { db, refs } = await seeded();
    let message = '';
    const client = new Anthropic({
      apiKey: 'test',
      fetch: async (_url, init) => {
        message = String(init?.body);
        return new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            content: [{ type: 'text', text: JSON.stringify({ contentBriefs: [], actions: [] }) }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    await planAndGuard(db, claudePlanner({ client }), now, { focus: refs });
    expect(message).toContain('마케터가 레퍼런스를 골라 기획을 요청했다');
    expect(message).toContain(refs[0]);
  });
});
