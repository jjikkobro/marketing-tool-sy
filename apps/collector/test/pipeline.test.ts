import { describe, expect, it } from 'vitest';
import { tiktokResearchAdapter } from '../src/adapters/tiktok-research.ts';
import type { SourceAdapter } from '../src/adapters/types.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { RunAlreadyActiveError, startRun } from '../src/db/repository.ts';
import {
  httpError,
  ok,
  scriptedTransport,
  tiktokPage,
  type TikTokVideoSeed,
} from '../src/demo/fixtures.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { runCollection } from '../src/pipeline/run-collection.ts';
import { adapterHealth, listErrors, relatedHashtags } from '../src/queries/index.ts';

const now = new Date('2026-11-24T03:00:00Z');
const query = { kind: 'keyword', value: 'spicy noodle challenge' } as const;
const noWait = { sleep: async () => {}, random: () => 0 };

function videos(
  from: number,
  to: number,
  overrides: Partial<TikTokVideoSeed> = {},
): TikTokVideoSeed[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    id: `73${String(from + i).padStart(17, '0')}`,
    username: `demo_creator_${from + i}`,
    description: 'demo',
    hashtags: ['spicynoodlechallenge'],
    hoursAgo: 1,
    views: 100,
    likes: 10,
    comments: 1,
    shares: 0,
    ...overrides,
  }));
}

function adapter(steps: Parameters<typeof scriptedTransport>[0]): SourceAdapter {
  return tiktokResearchAdapter({
    transport: scriptedTransport(steps),
    accessToken: 't',
    now: () => now,
  });
}

function rowCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM content').get() as { n: number }).n;
}

describe('runCollection', () => {
  it('같은 데이터를 두 번 수집해도 행 수가 늘지 않는다 (멱등성)', async () => {
    const db = openDatabase(':memory:');
    const page = () => ok(tiktokPage(videos(1, 5), { now, cursor: 5, hasMore: false }));

    const first = await runCollection(db, adapter([page()]), query, { retry: noWait });
    const second = await runCollection(db, adapter([page()]), query, { retry: noWait });

    expect(first.counters).toMatchObject({ inserted: 5, updated: 0 });
    expect(second.counters).toMatchObject({ inserted: 0, updated: 5 });
    expect(rowCount(db)).toBe(5);
  });

  it('페이지가 겹치면 실행 안에서 중복으로 세고 한 번만 저장한다', async () => {
    const db = openDatabase(':memory:');
    const result = await runCollection(
      db,
      adapter([
        ok(tiktokPage(videos(1, 5), { now, cursor: 5, hasMore: true })),
        ok(tiktokPage(videos(4, 8), { now, cursor: 10, hasMore: false })),
      ]),
      query,
      { retry: noWait },
    );
    expect(result.counters).toMatchObject({ itemsSeen: 10, inserted: 8, duplicates: 2 });
  });

  it('새 응답에 지표가 빠져도 이미 아는 값을 지우지 않는다', async () => {
    const db = openDatabase(':memory:');
    await runCollection(
      db,
      adapter([ok(tiktokPage(videos(1, 1), { now, cursor: 1, hasMore: false }))]),
      query,
      {
        retry: noWait,
      },
    );
    await runCollection(
      db,
      adapter([ok(tiktokPage(videos(1, 1, { views: null }), { now, cursor: 1, hasMore: false }))]),
      query,
      { retry: noWait },
    );
    expect(db.prepare('SELECT views FROM content').get()).toEqual({ views: 100 });
  });

  it('중간 페이지에서 실패하면 받은 데이터는 저장하고 partial로 끝낸다', async () => {
    const db = openDatabase(':memory:');
    const result = await runCollection(
      db,
      adapter([
        ok(tiktokPage(videos(1, 3), { now, cursor: 3, hasMore: true })),
        httpError(401, {}),
      ]),
      query,
      { retry: noWait },
    );
    expect(result.status).toBe('partial');
    expect(rowCount(db)).toBe(3);
    expect(listErrors(db)).toEqual([
      expect.objectContaining({ kind: 'auth', severity: 'error', attempt: 1 }),
    ]);
  });

  it('첫 페이지부터 실패하면 failed다', async () => {
    const db = openDatabase(':memory:');
    const result = await runCollection(db, adapter([httpError(401, {})]), query, { retry: noWait });
    expect(result.status).toBe('failed');
  });

  it('페이지 상한에 걸리면 조용히 끝내지 않고 truncated 경고를 남긴다', async () => {
    const db = openDatabase(':memory:');
    await runCollection(
      db,
      adapter([
        ok(tiktokPage(videos(1, 2), { now, cursor: 2, hasMore: true })),
        ok(tiktokPage(videos(3, 4), { now, cursor: 4, hasMore: true })),
      ]),
      query,
      { maxPages: 2, retry: noWait },
    );
    expect(listErrors(db).map((e) => e.kind)).toContain('truncated');
  });

  it('같은 어댑터·쿼리는 동시에 두 번 실행할 수 없다 (부분 UNIQUE 인덱스)', () => {
    const db = openDatabase(':memory:');
    const run = {
      adapterId: 'tiktok-research',
      platform: 'tiktok',
      source: 'official-api',
      query,
      now,
    } as const;
    startRun(db, run);
    expect(() => startRun(db, run)).toThrow(RunAlreadyActiveError);
    expect(() =>
      startRun(db, { ...run, query: { kind: 'hashtag', value: 'other' } }),
    ).not.toThrow();
  });

  it('예상하지 못한 오류가 나도 실행을 running으로 남기지 않는다', async () => {
    const db = openDatabase(':memory:');
    const broken: SourceAdapter = {
      ...adapter([]),
      fetchPage: async () => '{}',
      parsePage: () => {
        throw new TypeError('예상 못한 버그');
      },
    };
    await runCollection(db, broken, query, { retry: noWait });
    // 다음 실행이 막히지 않아야 한다
    await expect(
      runCollection(
        db,
        adapter([ok(tiktokPage(videos(1, 1), { now, cursor: 1, hasMore: false }))]),
        query,
        {
          retry: noWait,
        },
      ),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('평소 채워지던 필드가 사라지면 schema_drift 경고를 남긴다', async () => {
    const db = openDatabase(':memory:');
    await runCollection(
      db,
      adapter([ok(tiktokPage(videos(1, 6), { now, cursor: 6, hasMore: false }))]),
      query,
      {
        retry: noWait,
      },
    );
    await runCollection(
      db,
      adapter([ok(tiktokPage(videos(7, 12, { views: null }), { now, cursor: 6, hasMore: false }))]),
      query,
      { retry: noWait },
    );
    expect(listErrors(db)).toEqual([
      expect.objectContaining({
        stage: 'drift',
        kind: 'schema_drift',
        message: expect.stringContaining('views'),
      }),
    ]);
  });
});

describe('데모 시나리오 전체', () => {
  it('failures 시나리오의 상태와 오류 집계가 기대와 같다', async () => {
    const db = openDatabase(':memory:');
    const results = await runScenario(db, 'failures', { now });
    expect(results.map((r) => r.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'partial',
      'failed',
      'succeeded',
      'succeeded',
    ]);

    // 회귀: 같은 오류 종류가 여러 실행에 걸쳐 있을 때 마지막 실행 값만 남던 집계 버그
    const tiktok = adapterHealth(db).find((h) => h.adapterId === 'tiktok-research');
    expect(tiktok?.errorsByKind).toMatchObject({ server: 4, rate_limited: 1, truncated: 1 });
  });

  it('관련 해시태그로 탐색 범위를 넓힐 수 있다', async () => {
    const db = openDatabase(':memory:');
    await runScenario(db, 'normal', { now });
    const related = relatedHashtags(db, '#SpicyNoodleChallenge').map((h) => h.hashtag);
    expect(related).toContain('foodtok');
    expect(related).not.toContain('spicynoodlechallenge');
  });
});
