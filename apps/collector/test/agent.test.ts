import { describe, expect, it } from 'vitest';
import { extractNumbers, verifyProposal } from '../src/agent/guard.ts';
import { buildObservation } from '../src/agent/observation.ts';
import { recordedPlanner, RECORDED_PROPOSALS } from '../src/agent/planners.ts';
import {
  acknowledge,
  approve,
  planAndGuard,
  reject,
  ReviewError,
  submitProposal,
} from '../src/agent/review.ts';
import { getProposal } from '../src/agent/store.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { startRun } from '../src/db/repository.ts';
import { demoAdapterFactory } from '../src/demo/agent-adapters.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { toolNames } from '../src/mcp-tools.ts';
import type { ProposalDraft } from '../src/schema.ts';

const now = new Date('2026-11-24T03:00:00Z');
const noWait = { retry: { sleep: async () => {}, random: () => 0 } };

async function seeded(): Promise<Db> {
  const db = openDatabase(':memory:');
  await runScenario(db, 'failures', { now });
  return db;
}

function runCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM collection_run').get() as { n: number }).n;
}

const valid: ProposalDraft = {
  kind: 'collect_query',
  title: '#asmr 해시태그 수집',
  rationale: '#mukbang 게시물 12건에 #asmr이 함께 쓰였습니다.',
  adapterId: 'tiktok-research',
  queryKind: 'hashtag',
  queryValue: 'asmr',
  runId: null,
  evidence: ['related:mukbang>asmr'],
  claims: [{ factId: 'related:mukbang>asmr', field: 'contents', value: 12 }],
};

function failedChecks(db: Db, draft: unknown) {
  return verifyProposal(db, buildObservation(db, now), draft, now)
    .checks.filter((c) => !c.passed)
    .map((c) => c.check);
}

describe('가드: 할루시네이션 차단', () => {
  it('근거가 맞는 제안은 7개 검사를 모두 통과한다', async () => {
    const db = await seeded();
    expect(failedChecks(db, valid)).toEqual([]);
  });

  it('관찰 사실에 없는 근거를 인용하면 막는다', async () => {
    const db = await seeded();
    expect(failedChecks(db, { ...valid, evidence: ['hashtag:spicyramen'], claims: [] })).toContain(
      'evidence',
    );
  });

  it('수치를 부풀리면 SQL 값과 대조해 막는다', async () => {
    const db = await seeded();
    const inflated = {
      ...valid,
      claims: [{ factId: 'related:mukbang>asmr', field: 'contents', value: 120 }],
    };
    expect(failedChecks(db, inflated)).toContain('claims');
  });

  it('claims에 없는 숫자를 문장에 슬쩍 넣어도 막는다', async () => {
    const db = await seeded();
    const sneaky = {
      ...valid,
      rationale: '#mukbang 게시물 12건에 #asmr이 함께 쓰였고 지난주보다 240% 늘었습니다.',
    };
    expect(failedChecks(db, sneaky)).toEqual(['grounded_numbers']);
  });

  it('지원하지 않는 검색(Instagram 키워드)은 막는다', async () => {
    const db = await seeded();
    const unsupported = { ...valid, adapterId: 'instagram-graph', queryKind: 'keyword' };
    expect(failedChecks(db, unsupported)).toContain('capability');
  });

  it('최근에 수집한 쿼리와 검토 중인 같은 제안은 중복으로 막는다', async () => {
    const db = await seeded();
    expect(
      failedChecks(db, { ...valid, queryKind: 'keyword', queryValue: 'spicy noodle challenge' }),
    ).toContain('duplicate');
    submitProposal(db, valid, 'test', now);
    expect(failedChecks(db, valid)).toContain('duplicate');
  });

  it('Instagram 7일 해시태그 한도(30개)를 넘기는 제안은 막는다', async () => {
    const db = await seeded();
    for (let i = 0; i < 30; i += 1) {
      const id = startRun(db, {
        adapterId: 'instagram-graph',
        platform: 'instagram',
        source: 'official-api',
        query: { kind: 'hashtag', value: `tag${i}` },
        now,
      });
      db.prepare(
        `UPDATE collection_run SET status = 'succeeded', finished_at = ? WHERE id = ?`,
      ).run(now.toISOString(), id);
    }
    const ig = {
      ...valid,
      adapterId: 'instagram-graph',
      queryValue: 'brandnew',
      evidence: ['quota:instagram-hashtags'],
      claims: [],
      rationale: '새 해시태그입니다.',
    };
    expect(failedChecks(db, ig)).toContain('quota');
  });

  it('형식이 틀린 출력은 저장 전에 거른다', async () => {
    const db = await seeded();
    expect(failedChecks(db, { kind: 'delete_everything' })).toEqual(['schema']);
  });

  it('문장에서 숫자를 뽑을 때 해시태그와 실행 번호는 빼고, 쉼표는 정리한다', () => {
    expect(extractNumbers('실행 #4는 #top10 태그로 3,200,000회 조회, 2.5배')).toEqual([
      3_200_000, 2.5,
    ]);
  });

  it('녹화된 계획 응답 6개 중 할루시네이션 3개를 정확히 막는다', async () => {
    const db = await seeded();
    const results = await planAndGuard(db, recordedPlanner(), now);
    expect(results.map((r) => r.proposal?.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'blocked',
      'blocked',
      'blocked',
    ]);
    expect(RECORDED_PROPOSALS).toHaveLength(6);
  });
});

describe('사람의 확인 구조', () => {
  it('계획·검증 단계에서는 아무것도 실행되지 않는다', async () => {
    const db = await seeded();
    const before = runCount(db);
    await planAndGuard(db, recordedPlanner(), now);
    expect(runCount(db)).toBe(before);
  });

  it('승인하면 승인 시점에 재검증한 뒤 실행하고, 누가 승인했는지 남긴다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, valid, 'test', now);
    const result = await approve(db, proposal!.id, {
      reviewer: 'jung',
      note: 'ok',
      now,
      adapterFor: demoAdapterFactory(now),
      runOptions: noWait,
    });
    expect(result).toMatchObject({ status: 'executed', reviewer: 'jung', reviewNote: 'ok' });
    expect(result.resultRunId).not.toBeNull();
  });

  it('제안 이후 상황이 바뀌면(같은 쿼리가 먼저 수집됨) 승인 시점 재검증이 막는다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, valid, 'test', now);
    // 다른 경로로 같은 쿼리가 먼저 수집됨
    startRun(db, {
      adapterId: 'tiktok-research',
      platform: 'tiktok',
      source: 'official-api',
      query: { kind: 'hashtag', value: 'asmr' },
      now,
    });
    const before = runCount(db);
    const result = await approve(db, proposal!.id, {
      reviewer: 'jung',
      now,
      adapterFor: demoAdapterFactory(now),
    });
    expect(result.status).toBe('blocked');
    expect(runCount(db)).toBe(before);
  });

  it('가드에 막힌 제안은 승인할 수 없다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, { ...valid, evidence: ['hashtag:nope'] }, 'test', now);
    await expect(
      approve(db, proposal!.id, { reviewer: 'jung', adapterFor: demoAdapterFactory(now) }),
    ).rejects.toThrow(ReviewError);
  });

  it('검토자 이름 없이, 사유 없이는 결정할 수 없다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, valid, 'test', now);
    await expect(
      approve(db, proposal!.id, { reviewer: '  ', adapterFor: demoAdapterFactory(now) }),
    ).rejects.toThrow(ReviewError);
    expect(() => reject(db, proposal!.id, { reviewer: 'jung', note: '' })).toThrow(ReviewError);
    expect(getProposal(db, proposal!.id).status).toBe('pending');
  });

  it('DB도 사유 없는 거절과 검토자 없는 결정을 막는다 (앱 코드를 우회해도)', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, valid, 'test', now);
    expect(() =>
      db.prepare(`UPDATE agent_proposal SET status = 'rejected' WHERE id = ?`).run(proposal!.id),
    ).toThrow(/CHECK/);
  });

  it('운영 조치 제안은 실행하지 않고 확인만 한다', async () => {
    const db = await seeded();
    const op = RECORDED_PROPOSALS.find((p) => p.kind === 'operator_action');
    const { proposal } = submitProposal(db, op, 'test', now);
    await expect(
      approve(db, proposal!.id, { reviewer: 'jung', adapterFor: demoAdapterFactory(now) }),
    ).rejects.toThrow(ReviewError);
    expect(acknowledge(db, proposal!.id, { reviewer: 'jung' }).status).toBe('acknowledged');
  });

  it('MCP에는 제안 도구만 있고 승인·실행 도구는 없다', () => {
    expect(toolNames).toContain('propose_action');
    expect(
      toolNames.some((name) => /approve|execute|reject|ack|delete|run_collection/.test(name)),
    ).toBe(false);
  });
});
