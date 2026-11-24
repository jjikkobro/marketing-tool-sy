/**
 * 라이브 데모의 시드 DB. 서버가 시작될 때 한 번 만들고, 방문자 세션은 이것을 복제한다.
 *
 * Chromium을 띄울 수 있으면 브라우저 수집(가상 피드 v1→v3)까지 포함한 전체 시나리오를,
 * 없으면 브라우저 단계를 뺀 시나리오를 쓴다. 어느 쪽인지 화면에 표시한다.
 */
import { openDatabase } from '../db/database.ts';
import { runAgentDemo } from '../demo/agent-demo.ts';
import { runScenario } from '../demo/scenarios.ts';

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
): Promise<{ seed: Buffer; browserSeeded: boolean }> {
  const db = openDatabase(':memory:');
  const browserSeeded = await canLaunchBrowser();
  await runScenario(db, browserSeeded ? 'full' : 'failures', { now });
  await runAgentDemo(db, now);
  const seed = db.serialize();
  db.close();
  return { seed, browserSeeded };
}
