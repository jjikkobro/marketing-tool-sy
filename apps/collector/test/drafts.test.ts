/**
 * 콘텐츠 초안(채택 기획안 → 초안 → 발행)과 Admin 지침(동적 설정)
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { activeGuidelines, getConfig, updateConfig } from '../src/agent/config.ts';
import {
  claudeDrafter,
  createDraft,
  discardDraft,
  publishDraft,
  templateDrafter,
  verifyDraft,
  type Drafter,
} from '../src/agent/drafts.ts';
import { claudePlanner } from '../src/agent/planners.ts';
import { DEFAULT_GUIDELINES } from '../src/agent/prompts.ts';
import { ReviewError } from '../src/agent/review.ts';
import { getProposal } from '../src/agent/store.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { runAgentDemo } from '../src/demo/agent-demo.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { buildObservation } from '../src/agent/observation.ts';

const now = new Date('2026-11-24T03:00:00Z');

/** 녹화 시나리오 + 에이전트 데모: 첫 기획안이 채택되고 템플릿 초안이 하나 생긴다 */
async function seeded(): Promise<{ db: Db; briefId: number; pendingBriefId: number | null }> {
  const db = openDatabase(':memory:');
  await runScenario(db, 'failures', { now });
  const submitted = await runAgentDemo(db, now);
  const briefs = submitted.flatMap((s) =>
    s.proposal?.kind === 'content_brief' ? [s.proposal.id] : [],
  );
  const adopted = briefs.find((id) => getProposal(db, id).status === 'approved');
  if (adopted === undefined) throw new Error('채택된 기획안이 없습니다');
  return {
    db,
    briefId: adopted,
    pendingBriefId: briefs.find((id) => getProposal(db, id).status === 'pending') ?? null,
  };
}

const fixed = (body: unknown): Drafter => ({ id: 'test', draft: async () => body });

const goodBody = {
  title: '매운 라면 도전 숏폼',
  script: '장면 1 — 소스를 붓는 클로즈업\n장면 2 — 3초 동안 표정\n장면 3 — 다음 도전자 지목',
  caption: '끝까지 먹을 수 있을까요? 여러분의 맵기 단계를 댓글로 알려주세요.',
  hashtags: ['#spicynoodlechallenge', 'foodtok'],
};

describe('초안: 채택된 기획안에서만 만든다', () => {
  it('데모 시드는 채택 기획안 하나와 템플릿 초안 하나를 만든다 (가드 통과)', async () => {
    const { db } = await seeded();
    const drafts = db.prepare('SELECT status, drafted_by FROM content_draft').all();
    expect(drafts).toEqual([{ status: 'draft', drafted_by: 'template' }]);
  });

  it('채택되지 않은 제안으로는 초안을 만들 수 없다', async () => {
    const { db } = await seeded();
    const collect = db
      .prepare("SELECT id FROM agent_proposal WHERE kind = 'collect_query' LIMIT 1")
      .get() as { id: number };
    await expect(createDraft(db, collect.id, templateDrafter(), now)).rejects.toThrow(ReviewError);
    await expect(createDraft(db, 9999, templateDrafter(), now)).rejects.toThrow(/없습니다/);
  });

  it('제작 사양 숫자("3초")는 허용하고, 데이터 수치·비율·한글 수는 막는다', async () => {
    const { db, briefId } = await seeded();
    const brief = getProposal(db, briefId);
    expect(verifyDraft(goodBody, brief).passed).toBe(true);
    // # 접두어는 저장할 때 뗀다
    expect(verifyDraft(goodBody, brief).body?.hashtags).toEqual([
      'spicynoodlechallenge',
      'foodtok',
    ]);

    for (const caption of [
      '조회수 120만을 찍은 그 챌린지!',
      '좋아요 5000개가 넘은 레시피',
      '다른 영상보다 세 배 반응',
      '반응이 240% 올랐어요',
    ]) {
      const result = verifyDraft({ ...goodBody, caption }, brief);
      expect(result.passed, caption).toBe(false);
      expect(result.checks.find((c) => c.check === 'grounded_numbers')?.passed).toBe(false);
    }
    expect(verifyDraft({ ...goodBody, hashtags: ['good', 'bad tag!'] }, brief).passed).toBe(false);
    expect(verifyDraft({ ...goodBody, script: '' }, brief).checks[0]?.check).toBe('schema');
  });

  it('가드를 통과하지 못한 초안은 blocked로 남고 발행할 수 없다', async () => {
    const { db, briefId } = await seeded();
    const blocked = await createDraft(
      db,
      briefId,
      fixed({ ...goodBody, caption: '조회 100만 돌파 챌린지' }),
      now,
    );
    expect(blocked.status).toBe('blocked');
    expect(() => publishDraft(db, blocked.id, { reviewer: 'kim' }, now)).toThrow(/blocked/);
  });
});

describe('초안: 발행과 폐기는 사람의 결정이다', () => {
  it('고친 본문도 같은 검사를 통과해야 발행된다. 고친 사람이 기록된다', async () => {
    const { db, briefId } = await seeded();
    const draft = await createDraft(db, briefId, fixed(goodBody), now);

    expect(() =>
      publishDraft(
        db,
        draft.id,
        { reviewer: 'kim', edits: { caption: '조회수 3000회 인증' } },
        now,
      ),
    ).toThrow(/검사를 통과하지 못했습니다/);
    expect(() => publishDraft(db, draft.id, { reviewer: ' ' }, now)).toThrow(/검토자/);

    const published = publishDraft(
      db,
      draft.id,
      { reviewer: 'kim', note: '톤 조정', edits: { caption: '끝까지 먹을 수 있을까요?' } },
      now,
    );
    expect(published).toMatchObject({
      status: 'published',
      caption: '끝까지 먹을 수 있을까요?',
      editedBy: 'kim',
      reviewer: 'kim',
    });
    // 두 번 발행할 수 없다
    expect(() => publishDraft(db, draft.id, { reviewer: 'lee' }, now)).toThrow(ReviewError);
  });

  it('버릴 때는 이유가 필요하다', async () => {
    const { db, briefId } = await seeded();
    const draft = await createDraft(db, briefId, fixed(goodBody), now);
    expect(() => discardDraft(db, draft.id, { reviewer: 'kim', note: '' }, now)).toThrow(/이유/);
    expect(
      discardDraft(db, draft.id, { reviewer: 'kim', note: '톤이 맞지 않음' }, now).status,
    ).toBe('discarded');
  });

  it('DB도 결정자 없이 발행 상태가 되는 것을 막는다', async () => {
    const { db, briefId } = await seeded();
    const draft = await createDraft(db, briefId, fixed(goodBody), now);
    expect(() =>
      db.prepare("UPDATE content_draft SET status = 'published' WHERE id = ?").run(draft.id),
    ).toThrow(/CHECK/);
  });
});

describe('Admin 지침: 버전으로 쌓이고, 계획자·초안 작성자의 프롬프트에 들어간다', () => {
  it('수정·되돌리기가 버전으로 남고, 빈 값과 너무 긴 값은 거부한다', async () => {
    const { db } = await seeded();
    expect(getConfig(db, 'brief_guidelines')).toMatchObject({ isDefault: true, versions: 0 });

    updateConfig(
      db,
      'brief_guidelines',
      { reviewer: 'kim', value: '- 오피스 점심 상황으로 기획한다' },
      now,
    );
    expect(activeGuidelines(db, 'brief_guidelines').value).toBe('- 오피스 점심 상황으로 기획한다');
    expect(getConfig(db, 'brief_guidelines')).toMatchObject({ isDefault: false, updatedBy: 'kim' });

    updateConfig(db, 'brief_guidelines', { reviewer: 'kim', value: null }, now);
    expect(activeGuidelines(db, 'brief_guidelines')).toEqual({
      value: DEFAULT_GUIDELINES.brief_guidelines,
      versionId: null,
    });
    expect(getConfig(db, 'brief_guidelines').versions).toBe(2);

    expect(() =>
      updateConfig(db, 'brief_guidelines', { reviewer: 'kim', value: '  ' }, now),
    ).toThrow(ReviewError);
    expect(() =>
      updateConfig(db, 'brief_guidelines', { reviewer: 'kim', value: 'x'.repeat(2001) }, now),
    ).toThrow(/2000자/);
    expect(() => updateConfig(db, 'brief_guidelines', { reviewer: '', value: 'a' }, now)).toThrow(
      ReviewError,
    );
  });

  it('지침은 고정 규칙 뒤에 붙어 실제 API 요청에 들어간다 (계획·초안 모두)', async () => {
    const { db, briefId } = await seeded();
    const systems: string[] = [];
    const client = new Anthropic({
      apiKey: 'test',
      fetch: async (_url, init) => {
        const body: unknown = JSON.parse(String(init?.body));
        if (typeof body === 'object' && body !== null && 'system' in body) {
          systems.push(String(body.system));
        }
        const output = systems.length === 1 ? { contentBriefs: [], actions: [] } : goodBody;
        return new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            content: [{ type: 'text', text: JSON.stringify(output) }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    await claudePlanner({ client, guidelines: '- 오피스 점심 상황' }).propose(
      buildObservation(db, now),
    );
    updateConfig(db, 'draft_guidelines', { reviewer: 'kim', value: '- 존댓말 캡션' }, now);
    const draft = await createDraft(db, briefId, claudeDrafter({ client }), now);

    expect(systems[0]).toContain('반드시 지킬 것');
    expect(systems[0]).toMatch(/마케터 지침[\s\S]*- 오피스 점심 상황$/);
    expect(systems[1]).toMatch(/마케터 지침[\s\S]*- 존댓말 캡션$/);
    expect(draft.status).toBe('draft');
    // 초안이 어떤 지침 버전으로 쓰였는지 남는다
    expect(
      db.prepare('SELECT guidelines_version AS v FROM content_draft WHERE id = ?').get(draft.id),
    ).toEqual({ v: activeGuidelines(db, 'draft_guidelines').versionId });
  });
});
