/**
 * YouTube API Services Developer Policies를 코드로 지킨다.
 * https://developers.google.com/youtube/terms/developer-policies (2026-11-24 확인)
 *
 * - III.E.4: 저장한 API 데이터(통계 포함)는 30일 안에 갱신하거나 지운다 → purgeExpiredYouTube
 * - III.E.2: 서로 다른 콘텐츠 소유자의 API 데이터를 합치지 않는다
 *   III.E.4.h: API 데이터로 새로운 파생 데이터·지표를 만들지 않는다
 *   → 해시태그·포맷 집계와 동시출현 분석에서 YouTube 데이터를 뺀다 (queries/index.ts).
 *     YouTube 영상은 YouTube가 준 값 그대로, 영상 단위로만 보여주고 원본 링크와 출처를 붙인다.
 * - 쿼터: search.list는 하루 100회, 태평양 시간 자정 초기화 → 하루 검색 상한을 가드가 검사한다
 *
 * Authorized/Non-Authorized Data의 정의(정책 IV)는 읽지 않았다. 어느 쪽이든 30일 규칙은 같아서 가장 보수적으로 적용했다.
 */
import type { Db } from '../db/database.ts';

export const YOUTUBE_RETENTION_DAYS = 30;
/** 문서상 하루 100회. 실패한 요청도 쿼터를 쓰므로 여유를 둔다 */
export const YOUTUBE_DAILY_SEARCH_LIMIT = Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT ?? 80);

export function purgeExpiredYouTube(db: Db, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - YOUTUBE_RETENTION_DAYS * 86_400_000).toISOString();
  return db
    .prepare(`DELETE FROM content WHERE platform = 'youtube' AND last_seen_at < ?`)
    .run(cutoff).changes;
}

/** 태평양 시간 기준 오늘 0시의 UTC 시각 (쿼터 초기화 시점) */
export function pacificDayStart(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const elapsedToday =
    (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - elapsedToday);
}

/** 오늘(태평양 시간) YouTube 검색을 몇 번 했는지. 실행 한 번의 페이지 수만큼 search.list를 부른다. */
export function youtubeSearchesToday(db: Db, now: Date = new Date()): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(pages_fetched, 1)), 0) AS n FROM collection_run
        WHERE adapter_id = 'youtube-data' AND started_at >= ?`,
    )
    .get(pacificDayStart(now).toISOString()) as { n: number };
  return row.n;
}
