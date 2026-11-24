import { describe, expect, it } from 'vitest';
import { classifyFormat } from '../src/core/format.ts';
import { verifyProposal } from '../src/agent/guard.ts';
import { buildObservation } from '../src/agent/observation.ts';
import { RECORDED_PROPOSALS } from '../src/agent/planners.ts';
import { approve, reject, submitProposal } from '../src/agent/review.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { demoAdapterFactory } from '../src/demo/agent-adapters.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import type { ProposalDraft } from '../src/schema.ts';

const now = new Date('2026-11-24T03:00:00Z');

async function seeded(): Promise<Db> {
  const db = openDatabase(':memory:');
  await runScenario(db, 'failures', { now });
  return db;
}

const brief = RECORDED_PROPOSALS.find((p): p is ProposalDraft => p.kind === 'content_brief');

function failed(db: Db, draft: unknown) {
  return verifyProposal(db, buildObservation(db, now), draft, now)
    .checks.filter((c) => !c.passed)
    .map((c) => c.check);
}

function runCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM collection_run').get() as { n: number }).n;
}

describe('포맷 분류 (결정적 규칙)', () => {
  it('캡션·해시태그로 포맷을 나누고, 맞는 규칙이 없으면 other', () => {
    expect(classifyFormat('Day 3 of the spicy noodle challenge', [])).toBe('challenge');
    expect(classifyFormat('3-minute ramen hack', [])).toBe('recipe_hack');
    expect(classifyFormat('quiet eating', ['asmr'])).toBe('mukbang_asmr');
    expect(classifyFormat('first time trying fire noodles', [])).toBe('reaction_review');
    expect(classifyFormat('just lunch', [])).toBe('other');
  });

  it('해시태그는 주제라서 캡션보다 뒤에 본다 (#spicynoodlechallenge가 붙은 레시피 영상은 레시피)', () => {
    expect(
      classifyFormat('Trying the viral fire noodle recipe at home', ['spicynoodlechallenge']),
    ).toBe('recipe_hack');
    expect(classifyFormat('Fire noodle recipe at home #spicynoodlechallenge', [])).toBe(
      'recipe_hack',
    );
    expect(classifyFormat('lunch', ['spicynoodlechallenge'])).toBe('challenge');
  });
});

describe('마케터용 기획안 (content_brief)', () => {
  it('녹화 기획안은 모든 검사를 통과한다 (제작 사양 숫자·D+7은 허용)', async () => {
    expect(failed(await seeded(), brief)).toEqual([]);
  });

  it('인용하지 않은 포맷으로 기획하면 막는다', async () => {
    const draft = { ...brief, plan: { ...brief?.plan, format: 'reaction_review' } };
    expect(failed(await seeded(), draft)).toContain('target');
  });

  it('사양 칸을 이용해 데이터 수치를 넣으면 막는다 ("조회 120만")', async () => {
    const draft = {
      ...brief,
      plan: { ...brief?.plan, deliverable: '15초 숏폼 1편, 예상 조회 120만' },
    };
    expect(failed(await seeded(), draft)).toContain('grounded_numbers');
  });

  it('실제 Claude 출력 회귀: 훅의 "첫 2초" 같은 시간 사양은 허용한다', async () => {
    const draft = {
      ...brief,
      plan: { ...brief?.plan, hook: '첫 2초에 면을 끌어올리는 소리를 자막 없이 들려준다' },
    };
    expect(failed(await seeded(), draft)).toEqual([]);
  });

  it('실제 Claude 출력 회귀: "꿀팁 1가지", "1인분 기준" 같은 제작 사양은 허용한다', async () => {
    const draft = {
      ...brief,
      plan: {
        ...brief?.plan,
        deliverable: '30초 내외 세로형 숏폼 1편 (매운 라면 꿀팁 1가지 + 완성 컷)',
        brandRisk: '과식을 조장하지 않도록 1인분 기준으로 촬영한다',
      },
    };
    expect(failed(await seeded(), draft)).toEqual([]);
  });

  it('사양 칸에 측정 단위가 붙은 숫자("5,000회", "좋아요 300")는 막는다', async () => {
    const db = await seeded();
    expect(
      failed(db, { ...brief, plan: { ...brief?.plan, successCriteria: 'D+7 조회 5,000회 이상' } }),
    ).toContain('grounded_numbers');
    expect(
      failed(db, { ...brief, plan: { ...brief?.plan, hook: '좋아요 300을 넘긴 장면 재현' } }),
    ).toContain('grounded_numbers');
  });

  it('훅에 근거 없는 숫자를 쓰면 막는다', async () => {
    const draft = { ...brief, plan: { ...brief?.plan, hook: '조회 3배를 부르는 첫 장면' } };
    expect(failed(await seeded(), draft)).toContain('grounded_numbers');
  });

  it('같은 포맷의 기획안이 검토 중이면 중복으로 막는다', async () => {
    const db = await seeded();
    submitProposal(db, brief, 'test', now);
    expect(failed(db, { ...brief, title: '챌린지 포맷: 다른 각도의 기획' })).toContain('duplicate');
  });

  it('실제 Claude 출력 회귀: 포맷이 다른 기획안은 서로 중복이 아니다', async () => {
    const db = await seeded();
    submitProposal(db, brief, 'test', now);
    const other = {
      ...brief,
      // 실제 Claude는 먹방·ASMR 포맷이었다. 이 시나리오 데이터에 있는 다른 포맷으로 같은 상황을 만든다
      title: '레시피·꿀팁 포맷: 집에서 만드는 매운 면 꿀팁 숏폼',
      rationale: '레시피 포맷 콘텐츠가 꾸준히 반응을 얻습니다.',
      evidence: ['format:recipe_hack'],
      plan: { ...brief?.plan, format: 'recipe_hack', deliverable: '20초 숏폼 1편' },
    };
    expect(failed(db, other)).toEqual([]);
  });

  it('마케터가 거절한 포맷은 7일 동안 다시 올라오지 않는다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, brief, 'test', now);
    reject(db, proposal!.id, { reviewer: '마케터', note: '이번 분기 챌린지는 하지 않음', now });
    const again = verifyProposal(
      db,
      buildObservation(db, now),
      { ...brief, title: '챌린지 포맷: 새 각도' },
      now,
    ).checks.find((c) => c.check === 'duplicate');
    expect(again).toMatchObject({
      passed: false,
      detail: expect.stringContaining('이번 분기 챌린지는 하지 않음'),
    });
  });

  it('채택해도 수집을 실행하지 않고 승인 상태(실행 백로그)로 남는다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, brief, 'test', now);
    const before = runCount(db);
    const result = await approve(db, proposal!.id, {
      reviewer: '마케터',
      note: '이번 주 제작',
      now,
      adapterFor: demoAdapterFactory(now),
    });
    expect(result).toMatchObject({
      status: 'approved',
      reviewer: '마케터',
      resultRunId: null,
      plan: { format: 'challenge' },
    });
    expect(runCount(db)).toBe(before);
  });
});
