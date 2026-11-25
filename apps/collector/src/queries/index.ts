/**
 * 읽기 쿼리 모음. CLI, MCP 서버, 웹 export가 모두 이 함수만 쓴다.
 * 그래서 "AI가 보는 데이터"와 "사람이 보는 화면"이 항상 같은 SQL에서 나온다.
 */
import { classifyFormat } from '../core/format.ts';
import type { Db } from '../db/database.ts';
import type {
  AdapterHealth,
  CollectionError,
  CollectionRun,
  HashtagStat,
  Platform,
  StoredContent,
} from '../schema.ts';

interface ContentRow {
  platform: Platform;
  platform_content_id: string;
  source: StoredContent['source'];
  url: string | null;
  creator_handle: string | null;
  caption: string;
  hashtags: string;
  media_type: StoredContent['mediaType'];
  published_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  matched_query: string;
  first_seen_run_id: number;
  last_seen_run_id: number;
  first_seen_at: string;
  last_seen_at: string;
}

function toContent(row: ContentRow): StoredContent {
  return {
    platform: row.platform,
    platformContentId: row.platform_content_id,
    source: row.source,
    url: row.url,
    creatorHandle: row.creator_handle,
    caption: row.caption,
    hashtags: JSON.parse(row.hashtags) as string[],
    mediaType: row.media_type,
    publishedAt: row.published_at,
    metrics: { views: row.views, likes: row.likes, comments: row.comments, shares: row.shares },
    matchedQuery: row.matched_query,
    firstSeenRunId: row.first_seen_run_id,
    lastSeenRunId: row.last_seen_run_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export interface SearchParams {
  text?: string;
  hashtag?: string;
  platform?: Platform;
  minViews?: number;
  limit?: number;
}

/** 캡션·해시태그 검색. 조회수가 없는(NULL) 콘텐츠는 minViews 조건에서 제외하고, 정렬할 때는 맨 뒤로 보낸다. */
export function searchContents(db: Db, params: SearchParams = {}): StoredContent[] {
  const rows = db
    .prepare(
      `SELECT * FROM content c
        WHERE (:text IS NULL OR c.caption LIKE '%' || :text || '%' ESCAPE '\\')
          AND (:hashtag IS NULL OR EXISTS (SELECT 1 FROM json_each(c.hashtags) WHERE value = :hashtag))
          AND (:platform IS NULL OR c.platform = :platform)
          AND (:minViews IS NULL OR c.views >= :minViews)
        ORDER BY c.views IS NULL, c.views DESC, c.published_at DESC
        LIMIT :limit`,
    )
    .all({
      text: params.text ? params.text.replace(/[\\%_]/g, (ch) => `\\${ch}`) : null,
      hashtag: params.hashtag?.replace(/^#/, '').toLowerCase() ?? null,
      platform: params.platform ?? null,
      minViews: params.minViews ?? null,
      limit: params.limit ?? 20,
    }) as ContentRow[];
  return rows.map(toContent);
}

/** 해시태그별 콘텐츠 수와 조회수 합계. 조회수를 아는 콘텐츠가 하나도 없으면 합계는 NULL이다. */
export function topHashtags(db: Db, { limit = 15 } = {}): HashtagStat[] {
  return db
    .prepare(
      `SELECT tag.value AS hashtag, COUNT(*) AS contents, SUM(c.views) AS totalViews
         FROM content c, json_each(c.hashtags) tag
        WHERE c.platform <> 'youtube' -- YouTube 정책 III.E.2: 소유자가 다른 API 데이터를 합치지 않는다
        GROUP BY tag.value
        ORDER BY contents DESC, totalViews DESC
        LIMIT ?`,
    )
    .all(limit) as HashtagStat[];
}

/**
 * 탐색 범위 넓히기: 시드 해시태그와 함께 자주 쓰인 해시태그를 찾는다.
 * 다음 수집에 쓸 검색어 후보가 된다. LLM 없이 수집한 데이터만으로 계산하므로 결과를 설명할 수 있다.
 */
export function relatedHashtags(db: Db, seed: string, { limit = 10 } = {}): HashtagStat[] {
  return db
    .prepare(
      `SELECT other.value AS hashtag, COUNT(*) AS contents, SUM(c.views) AS totalViews
         FROM content c, json_each(c.hashtags) seed, json_each(c.hashtags) other
        WHERE seed.value = ? AND other.value <> seed.value
          AND c.platform <> 'youtube' -- YouTube 정책 III.E.2 (core/youtube-policy.ts)
        GROUP BY other.value
        ORDER BY contents DESC, totalViews DESC
        LIMIT ?`,
    )
    .all(seed.replace(/^#/, '').toLowerCase(), limit) as HashtagStat[];
}

interface RunRow {
  id: number;
  adapter_id: string;
  platform: Platform;
  source: CollectionRun['source'];
  query_kind: CollectionRun['query']['kind'];
  query_value: string;
  status: CollectionRun['status'];
  started_at: string;
  finished_at: string | null;
  pages_fetched: number;
  items_seen: number;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  retries: number;
}

function toRun(row: RunRow): CollectionRun {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    platform: row.platform,
    source: row.source,
    query: { kind: row.query_kind, value: row.query_value },
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    pagesFetched: row.pages_fetched,
    itemsSeen: row.items_seen,
    inserted: row.inserted,
    updated: row.updated,
    duplicates: row.duplicates,
    rejected: row.rejected,
    retries: row.retries,
  };
}

export function listRuns(db: Db, { limit = 20 } = {}): CollectionRun[] {
  const rows = db
    .prepare(`SELECT * FROM collection_run ORDER BY id DESC LIMIT ?`)
    .all(limit) as RunRow[];
  return rows.map(toRun);
}

export function getRun(db: Db, id: number): CollectionRun | null {
  const row = db.prepare(`SELECT * FROM collection_run WHERE id = ?`).get(id) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function listErrors(
  db: Db,
  { runId, limit = 100 }: { runId?: number; limit?: number } = {},
): CollectionError[] {
  return db
    .prepare(
      `SELECT id, run_id AS runId, stage, kind, severity, message, http_status AS httpStatus, attempt,
              created_at AS createdAt
         FROM collection_error
        WHERE (:runId IS NULL OR run_id = :runId)
        ORDER BY id DESC
        LIMIT :limit`,
    )
    .all({ runId: runId ?? null, limit }) as CollectionError[];
}

/** 어댑터별 실행 결과와 오류 종류별 건수. 수집 운영 모니터의 핵심 표다. */
export function adapterHealth(db: Db): AdapterHealth[] {
  const rows = db
    .prepare(
      `WITH last AS (
         SELECT adapter_id, status, finished_at,
                ROW_NUMBER() OVER (PARTITION BY adapter_id ORDER BY id DESC) AS rn
           FROM collection_run
          WHERE status <> 'running'
       ),
       -- 어댑터·오류 종류별로 먼저 다 센 뒤 객체로 묶는다. 같은 키가 두 번 들어가지 않게 하기 위해서다.
       error_counts AS (
         SELECT r.adapter_id, e.kind, COUNT(*) AS n
           FROM collection_error e
           JOIN collection_run r ON r.id = e.run_id
          GROUP BY r.adapter_id, e.kind
       ),
       errors AS (
         SELECT adapter_id, json_group_object(kind, n) AS by_kind
           FROM error_counts
          GROUP BY adapter_id
       )
       SELECT r.adapter_id AS adapterId, MIN(r.platform) AS platform, MIN(r.source) AS source,
              COUNT(*) AS runs,
              SUM(r.status = 'succeeded') AS succeeded,
              SUM(r.status = 'partial') AS partial,
              SUM(r.status = 'failed') AS failed,
              l.status AS lastStatus, l.finished_at AS lastFinishedAt,
              COALESCE(e.by_kind, '{}') AS errorsByKind
         FROM collection_run r
         LEFT JOIN last l ON l.adapter_id = r.adapter_id AND l.rn = 1
         LEFT JOIN errors e ON e.adapter_id = r.adapter_id
        GROUP BY r.adapter_id
        ORDER BY r.adapter_id`,
    )
    .all() as Array<Omit<AdapterHealth, 'errorsByKind'> & { errorsByKind: string }>;
  return rows.map((row) => ({
    ...row,
    errorsByKind: JSON.parse(row.errorsByKind) as Record<string, number>,
  }));
}

/**
 * 포맷별 콘텐츠 수와 조회 합계. 포맷은 캡션·해시태그로 결정적으로 분류한다 (core/format.ts).
 * YouTube 데이터는 정책상 집계에서 뺀다.
 */
export function formatStats(
  db: Db,
): Array<{ format: string; contents: number; totalViews: number | null }> {
  const rows = db
    .prepare(`SELECT caption, hashtags, views FROM content WHERE platform <> 'youtube'`)
    .all() as Array<{ caption: string; hashtags: string; views: number | null }>;
  const stats = new Map<string, { contents: number; totalViews: number | null }>();
  for (const row of rows) {
    const format = classifyFormat(row.caption, JSON.parse(row.hashtags) as string[]);
    const current = stats.get(format) ?? { contents: 0, totalViews: null };
    stats.set(format, {
      contents: current.contents + 1,
      totalViews: row.views === null ? current.totalViews : (current.totalViews ?? 0) + row.views,
    });
  }
  return [...stats.entries()]
    .map(([format, stat]) => ({ format, ...stat }))
    .sort((a, b) => b.contents - a.contents);
}
