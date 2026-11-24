import { describe, expect, it } from 'vitest';
import { submitProposal } from '../src/agent/review.ts';
import { openDatabase } from '../src/db/database.ts';
import { ClaudeBudget } from '../src/live/budget.ts';
import { SessionStore } from '../src/live/sessions.ts';
import { rejectCrossSite } from '../src/review-security.ts';

function seedBuffer(): Buffer {
  const db = openDatabase(':memory:');
  const buffer = db.serialize();
  db.close();
  return buffer;
}

const draft = {
  kind: 'operator_action',
  title: '토큰 갱신 필요',
  rationale: '토큰이 만료되었습니다.',
  adapterId: null,
  queryKind: null,
  queryValue: null,
  runId: null,
  plan: null,
  evidence: ['quota:instagram-hashtags'],
  claims: [],
} as const;

function proposalCount(db: { prepare: (sql: string) => { get: () => unknown } }): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM agent_proposal').get() as { n: number }).n;
}

describe('방문자별 샌드박스', () => {
  it('방문자마다 독립된 DB 사본을 받아, 한 사람의 변경이 다른 사람에게 보이지 않는다', () => {
    const store = new SessionStore(seedBuffer(), { maxSessions: 10, ttlMs: 60_000 });
    const a = store.resolve(undefined).session;
    const b = store.resolve(undefined).session;
    submitProposal(a.db, draft, 'test');
    expect(proposalCount(a.db)).toBe(1);
    expect(proposalCount(b.db)).toBe(0);
    expect(a.token).not.toBe(b.token);
  });

  it('같은 쿠키로 다시 오면 같은 샌드박스를 쓰고, 만료되면 새로 만든다', () => {
    let now = 0;
    const store = new SessionStore(seedBuffer(), { maxSessions: 10, ttlMs: 1_000, now: () => now });
    const first = store.resolve(undefined).session;
    expect(store.resolve(first.id)).toMatchObject({ created: false, session: { id: first.id } });
    now = 5_000;
    expect(store.resolve(first.id).created).toBe(true);
  });

  it('세션 수 상한을 넘으면 가장 오래 쓰지 않은 세션을 내보낸다', () => {
    let now = 0;
    const store = new SessionStore(seedBuffer(), { maxSessions: 2, ttlMs: 60_000, now: () => now });
    const oldest = store.resolve(undefined).session;
    now = 1;
    store.resolve(undefined);
    now = 2;
    store.resolve(undefined);
    expect(store.size).toBe(2);
    expect(store.resolve(oldest.id).created).toBe(true);
  });

  it('초기화해도 사용한 AI 호출 횟수는 유지된다 (초기화로 한도를 우회하지 못함)', () => {
    const store = new SessionStore(seedBuffer(), { maxSessions: 10, ttlMs: 60_000 });
    const session = store.resolve(undefined).session;
    session.plansUsed = 3;
    submitProposal(session.db, draft, 'test');
    const fresh = store.reset(session);
    expect(fresh.plansUsed).toBe(3);
    expect(proposalCount(fresh.db)).toBe(0);
  });
});

describe('Claude 호출 예산', () => {
  it('방문자별 상한, 하루 상한, 동시 호출 상한을 지킨다', () => {
    const budget = new ClaudeBudget({
      dailyLimit: 3,
      perSessionLimit: 2,
      maxConcurrent: 1,
      now: () => new Date('2026-11-24T00:00:00Z'),
    });
    expect(budget.acquire(0)).toEqual({ allowed: true });
    expect(budget.acquire(0)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('처리 중'),
    });
    budget.release();
    expect(budget.acquire(2)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('방문자'),
    });
    budget.acquire(1);
    budget.release();
    budget.acquire(0);
    budget.release();
    expect(budget.acquire(0)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('오늘'),
    });
  });

  it('UTC 자정이 지나면 하루 한도가 초기화된다', () => {
    let now = new Date('2026-11-24T23:59:00Z');
    const budget = new ClaudeBudget({
      dailyLimit: 1,
      perSessionLimit: 5,
      maxConcurrent: 5,
      now: () => now,
    });
    budget.acquire(0);
    budget.release();
    expect(budget.status(0).remainingToday).toBe(0);
    now = new Date('2026-11-25T00:01:00Z');
    expect(budget.status(0).remainingToday).toBe(1);
  });
});

describe('공개 배포 주소의 쓰기 요청', () => {
  const token = 't'.repeat(43);
  const base = { 'content-type': 'application/json', 'x-review-token': token };

  it('허용한 공개 Host에서 같은 출처로 온 요청은 통과한다', () => {
    expect(
      rejectCrossSite(
        {
          ...base,
          host: 'social-collector.onrender.com',
          origin: 'https://social-collector.onrender.com',
        },
        token,
        ['social-collector.onrender.com'],
      ),
    ).toBeNull();
  });

  it('공개 Host라도 다른 출처에서 온 요청이나, 허용하지 않은 Host는 막는다', () => {
    const hosts = ['social-collector.onrender.com'];
    expect(
      rejectCrossSite(
        { ...base, host: 'social-collector.onrender.com', origin: 'https://evil.example' },
        token,
        hosts,
      ),
    ).toMatch(/출처/);
    expect(
      rejectCrossSite(
        { ...base, host: 'evil.example', origin: 'https://evil.example' },
        token,
        hosts,
      ),
    ).toMatch(/Host/);
  });
});
