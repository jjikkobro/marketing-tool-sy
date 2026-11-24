/**
 * 라이브 데모의 시드 DB. 서버가 시작될 때 한 번 만들고, 방문자 세션은 이것을 복제한다.
 *
 * Chromium을 띄울 수 있으면 브라우저 수집(가상 피드 v1→v3)까지 포함한 전체 시나리오를,
 * 없으면 브라우저 단계를 뺀 시나리오를 쓴다. 어느 쪽인지 화면에 표시한다.
 */
import { openDatabase } from '../db/database.ts';
import { runAgentDemo } from '../demo/agent-demo.ts';
import { runScenario } from '../demo/scenarios.ts';
import { fetchTransport } from '../adapters/http.ts';
import { youtubeDataAdapter } from '../adapters/youtube-data.ts';
import { runCollection } from '../pipeline/run-collection.ts';
import type { CollectQuery } from '../schema.ts';

/** 시드에 넣을 실제 YouTube 검색. 서버가 뜰 때마다 쓰는 쿼터(검색 2회)를 작게 유지한다 */
const YOUTUBE_SEED_QUERIES: CollectQuery[] = [
  { kind: 'keyword', value: 'spicy noodle challenge' },
  { kind: 'keyword', value: 'korean ramen recipe' },
];

async function canLaunchBrowser(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

export async function buildSeed(
  now: Date = new Date(),
): Promise<{ seed: Buffer; browserSeeded: boolean; youtubeSeeded: number }> {
  const db = openDatabase(':memory:');
  const browserSeeded = await canLaunchBrowser();
  await runScenario(db, browserSeeded ? 'full' : 'failures', { now });
  const youtubeSeeded = await seedYouTube(db);
  await runAgentDemo(db, now);
  const seed = db.serialize();
  db.close();
  return { seed, browserSeeded, youtubeSeeded };
}

/** YOUTUBE_API_KEY가 있으면 실제 YouTube에서 수집한다. 실패해도 서버는 뜨고, 실패는 실행 기록에 남는다. */
async function seedYouTube(db: Parameters<typeof runCollection>[0]): Promise<number> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return 0;
  const adapter = youtubeDataAdapter({ transport: fetchTransport(), apiKey });
  let inserted = 0;
  for (const query of YOUTUBE_SEED_QUERIES) {
    try {
      const result = await runCollection(db, adapter, query, { maxPages: 1 });
      inserted += result.counters.inserted;
      console.log(
        `  YouTube 실제 수집 "${query.value}": ${result.status}, 신규 ${result.counters.inserted}건`,
      );
    } catch (error) {
      console.error(`  YouTube 실제 수집 실패 "${query.value}":`, error);
    }
  }
  return inserted;
}
