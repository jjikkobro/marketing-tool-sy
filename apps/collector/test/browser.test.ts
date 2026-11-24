/**
 * 실제 Chromium으로 가상 피드를 수집한다. 브라우저를 띄울 수 없는 환경에서는 건너뛴다.
 * CI에서는 `npx playwright install --with-deps chromium` 후 항상 실행된다.
 */
import { describe, expect, it } from 'vitest';
import { browserFeedAdapter, parseViews } from '../src/adapters/browser-feed.ts';
import { openDatabase } from '../src/db/database.ts';
import { runScenario } from '../src/demo/scenarios.ts';
import { listErrors } from '../src/queries/index.ts';

const canLaunch = await import('playwright')
  .then(({ chromium }) => chromium.launch())
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

describe('parseViews', () => {
  it('숫자가 없으면 0이 아니라 null이다', () => {
    expect(parseViews('12,345 views')).toBe(12_345);
    expect(parseViews('views hidden')).toBeNull();
    expect(parseViews(null)).toBeNull();
  });
});

describe('브라우저 피드 파서 (브라우저 없이)', () => {
  const adapter = browserFeedAdapter({ pageFile: '/dev/null' });
  const query = { kind: 'hashtag', value: 'x' } as const;

  it('블록은 보이는데 카드가 0건이면 마크업 변화로 판단한다', () => {
    expect(() => adapter.parsePage(JSON.stringify({ visibleBlocks: 3, cards: [] }), query)).toThrow(
      /셀렉터/,
    );
  });

  it('페이지가 정말 비어 있으면 오류가 아니라 0건이다', () => {
    expect(adapter.parsePage(JSON.stringify({ visibleBlocks: 0, cards: [] }), query).items).toEqual(
      [],
    );
  });
});

describe.skipIf(!canLaunch)('실제 Chromium으로 가상 피드 v1→v2→v3 수집', () => {
  it('v2는 조회수 소실 경고, v3는 셀렉터 0건 오류를 남긴다', async () => {
    const db = openDatabase(':memory:');
    const results = await runScenario(db, 'browser');
    expect(results.map((r) => r.status)).toEqual(['succeeded', 'succeeded', 'failed']);
    expect(results[0]?.counters.inserted).toBe(8);

    const errors = listErrors(db).reverse();
    expect(errors).toEqual([
      expect.objectContaining({
        runId: results[1]?.runId,
        stage: 'drift',
        message: expect.stringContaining('views'),
      }),
      expect.objectContaining({
        runId: results[2]?.runId,
        stage: 'parse',
        kind: 'schema_drift',
        severity: 'error',
      }),
    ]);
  }, 60_000);
});
