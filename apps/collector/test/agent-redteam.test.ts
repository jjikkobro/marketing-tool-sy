/**
 * 레드팀 검토에서 재현된 우회 사례의 회귀 테스트 (docs/decisions/0004).
 * 각 테스트 이름의 [A]~[J]는 레드팀 리포트의 사례 번호다.
 */
import { describe, expect, it } from 'vitest';
import { verifyProposal } from '../src/agent/guard.ts';
import { buildObservation } from '../src/agent/observation.ts';
import { approve, reject, ReviewError, submitProposal } from '../src/agent/review.ts';
import { getProposal } from '../src/agent/store.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { finishRun, startRun } from '../src/db/repository.ts';
import { demoAdapterFactory } from '../src/demo/agent-adapters.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { rejectCrossSite } from '../src/review-security.ts';
import type { ProposalDraft } from '../src/schema.ts';

const now = new Date('2026-11-24T03:00:00Z');
const runOptions = { retry: { sleep: async () => {}, random: () => 0 } };

async function seeded(): Promise<Db> {
  const db = openDatabase(':memory:');
  await runScenario(db, 'failures', { now });
  return db;
}

/** 정상 제안: #mukbang 게시물 12건에 #asmr이 함께 쓰였다 (related:mukbang>asmr.contents = 12) */
const base: ProposalDraft = {
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

function failed(db: Db, draft: ProposalDraft): string[] {
  return verifyProposal(db, buildObservation(db, now), draft, now)
    .checks.filter((c) => !c.passed)
    .map((c) => c.check);
}

describe('레드팀: 숫자 가드 우회', () => {
  it('기준: 정상 제안은 8개 검사를 모두 통과한다', async () => {
    expect(failed(await seeded(), base)).toEqual([]);
  });

  it('[A] 건수를 단위만 바꿔 "12만 회"로 쓰면 막는다', async () => {
    expect(
      failed(await seeded(), { ...base, rationale: '조회수 12만 회를 기록했습니다.' }),
    ).toContain('grounded_numbers');
  });

  it('[B] 한글로 쓴 수("삼백만 회", "두 배")는 막는다', async () => {
    const db = await seeded();
    expect(
      failed(db, { ...base, rationale: '#mukbang 게시물 12건, 조회 삼백만 회입니다.' }),
    ).toContain('grounded_numbers');
    expect(
      failed(db, { ...base, rationale: '#mukbang 게시물 12건, 지난주의 두 배입니다.' }),
    ).toContain('grounded_numbers');
  });

  it('[C] 쿼터 사실을 근거에 끼워 넣어 얻은 숫자(7일, 30)도 claims에 없으면 막는다', async () => {
    const draft = {
      ...base,
      evidence: [...base.evidence, 'quota:instagram-hashtags'],
      rationale: '#mukbang 게시물 12건, 최근 7일 동안 30개 계정이 썼습니다.',
    };
    expect(failed(await seeded(), draft)).toContain('grounded_numbers');
  });

  it('[E] 전각 숫자("１２０건")도 정규화해서 검사한다', async () => {
    expect(
      failed(await seeded(), { ...base, rationale: '#mukbang 게시물 １２０건에 함께 쓰였습니다.' }),
    ).toContain('grounded_numbers');
  });

  it('[F] 해시태그 뒤에 숫자를 숨겨도("#240%", "#1위") 숫자로 본다', async () => {
    const db = await seeded();
    expect(failed(db, { ...base, rationale: '#mukbang 게시물 12건, #240% 급증' })).toContain(
      'grounded_numbers',
    );
    expect(failed(db, { ...base, title: '#asmr #1위 해시태그 수집' })).toContain(
      'grounded_numbers',
    );
  });

  it('[G] 인용한 사실의 다른 필드 값(조회 합계)을 claims 없이 빌려 쓰면 막는다', async () => {
    const db = await seeded();
    const fact = buildObservation(db, now).facts.find((f) => f.factId === 'related:mukbang>asmr');
    const views = fact?.values.totalViews;
    expect(views).toBeDefined();
    expect(
      failed(db, { ...base, rationale: `#mukbang 게시물 12건, 조회 ${views}회입니다.` }),
    ).toContain('grounded_numbers');
  });

  it('[H] 건수를 비율로 바꿔 "12%"라고 쓰면 막는다', async () => {
    expect(
      failed(await seeded(), { ...base, rationale: '#mukbang 게시물의 12%가 #asmr을 씁니다.' }),
    ).toContain('grounded_numbers');
  });

  it('인용하지 않은 실행 번호("실행 #99")를 언급하면 막는다', async () => {
    expect(
      failed(await seeded(), {
        ...base,
        rationale: '#mukbang 게시물 12건, 실행 #99에서 확인했습니다.',
      }),
    ).toContain('grounded_numbers');
  });
});

describe('레드팀: 실행 대상 우회', () => {
  it('[D] 제목은 "#recipe 수집"인데 실제 쿼리가 다른 키워드면 막는다', async () => {
    const draft = {
      ...base,
      title: '#recipe 해시태그를 TikTok에서 직접 수집',
      queryKind: 'keyword' as const,
      queryValue: 'competitor brand leak',
    };
    expect(failed(await seeded(), draft)).toContain('target');
  });

  it('[J] 실행할 쿼리와 무관한 사실만 근거로 대면 막는다', async () => {
    const draft = {
      ...base,
      evidence: ['adapter:tiktok-research'],
      claims: [],
      rationale: '바이럴 폭발 중입니다.',
    };
    expect(failed(await seeded(), draft)).toContain('target');
  });

  it('[I] 대소문자·공백·#으로 쓴 쿼리도 정규화해서 중복을 잡는다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, base, 'test', now);
    await approve(db, proposal!.id, {
      reviewer: 'jung',
      now,
      adapterFor: demoAdapterFactory(now),
      runOptions,
    });
    for (const variant of ['ASMR ', '#asmr', ' Asmr']) {
      expect(failed(db, { ...base, queryValue: variant })).toContain('duplicate');
    }
  });

  it('실제 Claude 출력 회귀: 재실행 제안에 adapterId를 덧붙여도 같은 실행의 재실행은 중복으로 막는다', async () => {
    const db = await seeded();
    const retry = (extra: Partial<ProposalDraft>): ProposalDraft => ({
      ...base,
      kind: 'retry_run',
      title: '부분 실패한 실행 #4 다시 수집',
      rationale: '실행 #4가 503으로 부분 실패했습니다.',
      adapterId: null,
      queryKind: null,
      queryValue: null,
      runId: 4,
      evidence: ['run:4'],
      claims: [{ factId: 'run:4', field: 'lastHttpStatus', value: 503 }],
      ...extra,
    });
    submitProposal(db, retry({}), 'recorded', now);
    // 2026-11-24 실제 claude-opus-5-5 응답의 형태 (제안 #10)
    const fromClaude = retry({
      title: 'TikTok "fire noodle" 키워드 부분 실패 실행 재시도',
      adapterId: 'tiktok-research',
    });
    expect(failed(db, fromClaude)).toContain('duplicate');
    const { proposal } = submitProposal(db, retry({ adapterId: 'instagram-graph' }), 'test', now);
    expect(proposal?.adapterId).toBeNull();
  });

  it('사람이 거절한 대상은 같은 내용으로 다시 올라오지 않는다 (피드백)', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, base, 'test', now);
    reject(db, proposal!.id, { reviewer: 'jung', note: '이번 분기 대상 아님', now });
    const again = verifyProposal(db, buildObservation(db, now), base, now).checks.find(
      (c) => c.check === 'duplicate',
    );
    expect(again).toMatchObject({
      passed: false,
      detail: expect.stringContaining('이번 분기 대상 아님'),
    });
    expect(buildObservation(db, now).recentDecisions[0]).toMatchObject({
      status: 'rejected',
      reason: '이번 분기 대상 아님',
    });
  });
});

describe('레드팀: 사람의 확인과 상태 전이', () => {
  it('승인 시점 재검증은 관찰 범위(최근 실행 20개) 밖으로 밀려난 근거를 할루시네이션으로 오판하지 않는다', async () => {
    const db = await seeded();
    const retry = {
      ...base,
      kind: 'retry_run' as const,
      title: '실행 #4 재실행',
      rationale: '실행 #4가 부분 실패했습니다.',
      adapterId: null,
      queryKind: null,
      queryValue: null,
      runId: 4,
      evidence: ['run:4'],
      claims: [],
    };
    const { proposal } = submitProposal(db, retry, 'test', now);
    for (let i = 0; i < 25; i += 1) {
      const id = startRun(db, {
        adapterId: 'tiktok-research',
        platform: 'tiktok',
        source: 'official-api',
        query: { kind: 'hashtag', value: `filler${i}` },
        now,
      });
      finishRun(db, id, {
        status: 'succeeded',
        counters: {
          pagesFetched: 0,
          itemsSeen: 0,
          inserted: 0,
          updated: 0,
          duplicates: 0,
          rejected: 0,
          retries: 0,
        },
        fieldStats: {},
        now,
      });
    }
    const result = await approve(db, proposal!.id, {
      reviewer: 'jung',
      now,
      adapterFor: demoAdapterFactory(now),
      runOptions,
    });
    expect(result.status).toBe('executed');
  });

  it('같은 제안을 동시에 두 번 승인해도 한 번만 실행된다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, base, 'test', now);
    const input = { reviewer: 'jung', now, adapterFor: demoAdapterFactory(now), runOptions };
    const results = await Promise.allSettled([
      approve(db, proposal!.id, input),
      approve(db, proposal!.id, input),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: expect.any(ReviewError),
    });
  });

  it('실행이 실패해도 사람이 쓴 승인 사유는 남고, 오류는 따로 기록된다', async () => {
    const db = await seeded();
    const { proposal } = submitProposal(db, base, 'test', now);
    const result = await approve(db, proposal!.id, {
      reviewer: 'jung',
      note: '근거 확인함',
      now,
      adapterFor: () => {
        throw new Error('토큰 없음');
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      reviewNote: '근거 확인함',
      executionError: '토큰 없음',
    });
    expect(getProposal(db, proposal!.id).reviewer).toBe('jung');
  });
});

describe('레드팀: 검토 API CSRF', () => {
  const token = 'x'.repeat(43);
  const ok = {
    host: '127.0.0.1:8787',
    origin: 'http://localhost:5173',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'x-review-token': token,
  };

  it('같은 출처의 검토 화면 요청은 통과한다', () => {
    expect(rejectCrossSite(ok, token)).toBeNull();
  });

  it('다른 출처에서 text/plain으로 보낸 요청(재현된 공격)은 막는다', () => {
    expect(
      rejectCrossSite(
        {
          ...ok,
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          'content-type': 'text/plain',
        },
        token,
      ),
    ).not.toBeNull();
  });

  it('Origin이 맞아도 토큰이 없거나 틀리면 막는다', () => {
    expect(rejectCrossSite({ ...ok, 'x-review-token': undefined }, token)).toMatch(/토큰/);
    expect(rejectCrossSite({ ...ok, 'x-review-token': 'y'.repeat(43) }, token)).toMatch(/토큰/);
  });

  it('JSON이 아닌 Content-Type과 외부 Host(DNS 리바인딩)는 막는다', () => {
    expect(
      rejectCrossSite({ ...ok, 'content-type': 'application/x-www-form-urlencoded' }, token),
    ).toMatch(/Content-Type/);
    expect(rejectCrossSite({ ...ok, host: 'attacker.example:8787' }, token)).toMatch(/Host/);
  });
});
