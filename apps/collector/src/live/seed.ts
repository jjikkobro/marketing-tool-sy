/**
 * 라이브 데모의 시드 DB. 서버가 시작될 때 한 번 만들고, 방문자 세션은 이것을 복제한다.
 *
 * 실제 수집 키(YouTube·검색 API)가 있으면 "실제 데이터 모드"다.
 * - 실제 YouTube 검색 + 검색 API로 찾은 TikTok·Instagram 공개 게시물로 시드를 만든다.
 * - 녹화된 공식 API 시나리오는 넣지 않는다. 가상 지표가 실제 데이터와 섞여 집계되지 않게 하기 위해서다.
 *   실패 대응 재현(429·503·토큰 만료)은 `npm run demo:fail`과 정적 스냅샷(GitHub Pages)에 남아 있다.
 * - Claude 키가 있으면 실제 데이터로 계획을 한 번 받아 둔다. 첫 방문자도 빈 화면이 아니라 실제 제안을 본다.
 * 실제 키가 없으면 지금까지처럼 녹화 시나리오와 녹화 계획으로 만든다.
 *
 * 브라우저 수집(가상 피드 v1→v3, 구조 변화 감지)은 Chromium을 띄울 수 있으면 두 모드 모두 넣는다.
 * 대상은 저장소 안의 가상 피드뿐이다 (실제 SNS 스크래핑 금지).
 */
import { fetchTransport } from '../adapters/http.ts';
import type { SourceAdapter } from '../adapters/types.ts';
import { webSearchAdapter } from '../adapters/web-search.ts';
import { youtubeDataAdapter } from '../adapters/youtube-data.ts';
import { hasLiveCollection } from '../agent/availability.ts';
import { activeGuidelines } from '../agent/config.ts';
import { claudePlanner } from '../agent/planners.ts';
import { planAndGuard } from '../agent/review.ts';
import { openDatabase, type Db } from '../db/database.ts';
import { runAgentDemo } from '../demo/agent-demo.ts';
import { runScenario } from '../demo/scenarios.ts';
import { runCollection } from '../pipeline/run-collection.ts';
import type { CollectQuery } from '../schema.ts';

/** 시드 수집. 서버가 뜰 때마다 쓰는 쿼터(YouTube 검색 2회, 검색 API 3크레딧)를 작게 유지한다 */
const YOUTUBE_SEED_QUERIES: CollectQuery[] = [
  { kind: 'keyword', value: 'spicy noodle challenge' },
  { kind: 'keyword', value: 'korean ramen recipe' },
];
const SEARCH_SEED: { platform: 'tiktok' | 'instagram'; query: CollectQuery }[] = [
  { platform: 'tiktok', query: { kind: 'keyword', value: 'spicy noodle challenge' } },
  { platform: 'tiktok', query: { kind: 'hashtag', value: 'koreanfood' } },
  { platform: 'instagram', query: { kind: 'keyword', value: 'spicy noodle recipe' } },
];

export interface SeedResult {
  seed: Buffer;
  dataMode: 'live' | 'recorded';
  browserSeeded: boolean;
  realItems: number;
  plannedWithClaude: boolean;
}

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

export async function buildSeed(now: Date = new Date()): Promise<SeedResult> {
  const db = openDatabase(':memory:');
  const browserSeeded = await canLaunchBrowser();
  const liveKeys = hasLiveCollection();
  let live = liveKeys;
  let realItems = 0;
  let plannedWithClaude = false;

  if (live) {
    if (browserSeeded) await runScenario(db, 'browser', { now });
    realItems = await seedRealCollections(db);
    // 키가 틀렸거나 한도가 찼으면 실제 데이터가 0건이다. 빈 화면 대신 녹화 데이터로 채우고,
    // 실패한 실제 수집 기록은 운영 화면에 그대로 남긴다.
    if (realItems === 0) {
      console.warn(
        '  실제 수집 결과가 없어 녹화 데이터로 대체합니다 (운영 화면에 실패 기록이 남습니다)',
      );
      live = false;
    }
  }
  if (live) {
    plannedWithClaude = await seedClaudePlan(db, now);
  } else {
    // 실제 모드에서 이미 브라우저 단계를 돌렸으면 다시 넣지 않는다
    await runScenario(db, browserSeeded && !liveKeys ? 'full' : 'failures', { now });
    await runAgentDemo(db, now);
  }

  const seed = db.serialize();
  db.close();
  return {
    seed,
    dataMode: live ? 'live' : 'recorded',
    browserSeeded,
    realItems,
    plannedWithClaude,
  };
}

/** 실제 수집. 하나가 실패해도 서버는 뜨고, 실패는 실행 기록(운영 화면)에 남는다. */
async function seedRealCollections(db: Db): Promise<number> {
  const transport = fetchTransport();
  const steps: { adapter: SourceAdapter; query: CollectQuery }[] = [];
  const { YOUTUBE_API_KEY, TAVILY_API_KEY } = process.env;
  if (YOUTUBE_API_KEY) {
    const adapter = youtubeDataAdapter({ transport, apiKey: YOUTUBE_API_KEY });
    for (const query of YOUTUBE_SEED_QUERIES) steps.push({ adapter, query });
  }
  if (TAVILY_API_KEY) {
    for (const { platform, query } of SEARCH_SEED) {
      steps.push({
        adapter: webSearchAdapter({ transport, apiKey: TAVILY_API_KEY, platform }),
        query,
      });
    }
  }

  let inserted = 0;
  for (const { adapter, query } of steps) {
    try {
      const result = await runCollection(db, adapter, query, { maxPages: 1 });
      inserted += result.counters.inserted;
      console.log(
        `  실제 수집 ${adapter.id} "${query.value}": ${result.status}, 신규 ${result.counters.inserted}건`,
      );
    } catch (error) {
      console.error(`  실제 수집 실패 ${adapter.id} "${query.value}":`, error);
    }
  }
  return inserted;
}

/** 실제 데이터로 Claude 계획을 한 번 받아 둔다. 방문자 예산과 별개로 서버 시작 때 한 번만 호출한다. */
async function seedClaudePlan(db: Db, now: Date): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    const results = await planAndGuard(
      db,
      claudePlanner({
        model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
        effort: 'medium',
        guidelines: activeGuidelines(db, 'brief_guidelines').value,
      }),
      now,
    );
    console.log(`  Claude 시드 계획: 제안 ${results.length}건`);
    return true;
  } catch (error) {
    console.error('  Claude 시드 계획 실패 (방문자가 직접 요청하면 다시 시도한다):', error);
    return false;
  }
}
