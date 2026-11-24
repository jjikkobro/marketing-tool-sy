/**
 * 검색 API 하루 사용 상한. 무료 요금제는 한 달 1,000크레딧(기본 검색 1회 = 1크레딧)이라
 * 공개 데모에서 방문자가 한도를 다 쓰지 않도록 하루 상한을 둔다. 실패한 요청도 센다.
 */
import type { Db } from '../db/database.ts';

export const SEARCH_DAILY_LIMIT = Number(process.env.SEARCH_DAILY_LIMIT ?? 30);

export function webSearchesToday(db: Db, now: Date = new Date()): number {
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM collection_run
        WHERE source = 'web-search' AND started_at >= ?`,
    )
    .get(dayStart) as { n: number };
  return row.n;
}
