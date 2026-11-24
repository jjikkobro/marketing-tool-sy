import type { FieldStats } from '../core/drift.ts';
import type {
  CollectQuery,
  ErrorKind,
  ErrorStage,
  Platform,
  RunStatus,
  Severity,
  SocialContent,
  SourceKind,
} from '../schema.ts';
import type { Db } from './database.ts';

export class RunAlreadyActiveError extends Error {
  constructor(adapterId: string, query: CollectQuery) {
    super(`이미 실행 중입니다: ${adapterId} ${query.kind}:${query.value}`);
    this.name = 'RunAlreadyActiveError';
  }
}

export interface RunCounters {
  pagesFetched: number;
  itemsSeen: number;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  retries: number;
}

export function startRun(
  db: Db,
  run: {
    adapterId: string;
    platform: Platform;
    source: SourceKind;
    query: CollectQuery;
    now: Date;
  },
): number {
  try {
    const result = db
      .prepare(
        `INSERT INTO collection_run (adapter_id, platform, source, query_kind, query_value, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?)`,
      )
      .run(
        run.adapterId,
        run.platform,
        run.source,
        run.query.kind,
        run.query.value,
        run.now.toISOString(),
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new RunAlreadyActiveError(run.adapterId, run.query);
    }
    throw error;
  }
}

export function finishRun(
  db: Db,
  runId: number,
  result: {
    status: Exclude<RunStatus, 'running'>;
    counters: RunCounters;
    fieldStats: FieldStats;
    now: Date;
  },
): void {
  const c = result.counters;
  db.prepare(
    `UPDATE collection_run
        SET status = ?, finished_at = ?, pages_fetched = ?, items_seen = ?, inserted = ?, updated = ?,
            duplicates = ?, rejected = ?, retries = ?, field_stats = ?
      WHERE id = ?`,
  ).run(
    result.status,
    result.now.toISOString(),
    c.pagesFetched,
    c.itemsSeen,
    c.inserted,
    c.updated,
    c.duplicates,
    c.rejected,
    c.retries,
    JSON.stringify(result.fieldStats),
    runId,
  );
}

export function recordError(
  db: Db,
  runId: number,
  error: {
    stage: ErrorStage;
    kind: ErrorKind;
    severity: Severity;
    message: string;
    httpStatus?: number | null;
    attempt?: number | null;
    now: Date;
  },
): void {
  db.prepare(
    `INSERT INTO collection_error (run_id, stage, kind, severity, message, http_status, attempt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    runId,
    error.stage,
    error.kind,
    error.severity,
    error.message,
    error.httpStatus ?? null,
    error.attempt ?? null,
    error.now.toISOString(),
  );
}

/** 같은 어댑터의 직전 정상 실행이 남긴 필드 채움 비율. 플랫폼 변화 감지의 기준선이다. */
export function previousFieldStats(
  db: Db,
  adapterId: string,
  beforeRunId: number,
): FieldStats | null {
  const row = db
    .prepare(
      `SELECT field_stats FROM collection_run
        WHERE adapter_id = ? AND id < ? AND status = 'succeeded' AND field_stats IS NOT NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .get(adapterId, beforeRunId) as { field_stats: string } | undefined;
  return row ? (JSON.parse(row.field_stats) as FieldStats) : null;
}

/**
 * 콘텐츠 upsert. 새로 들어온 행과 갱신된 행을 구분해서 센다.
 * 지표는 새 값이 NULL이면 기존 값을 지우지 않는다. 한 번 수집에 실패했다고 이미 알고 있는 값을 잃으면 안 된다.
 */
export function upsertContent(
  db: Db,
  item: SocialContent,
  context: { runId: number; source: SourceKind; matchedQuery: string; now: Date },
): 'inserted' | 'updated' {
  const now = context.now.toISOString();
  const row = db
    .prepare(
      `INSERT INTO content (
         platform, platform_content_id, source, url, creator_handle, caption, hashtags, media_type, published_at,
         views, likes, comments, shares, matched_query, first_seen_run_id, last_seen_run_id, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (platform, platform_content_id) DO UPDATE SET
         url              = COALESCE(excluded.url, content.url),
         creator_handle   = COALESCE(excluded.creator_handle, content.creator_handle),
         caption          = excluded.caption,
         hashtags         = excluded.hashtags,
         views            = COALESCE(excluded.views, content.views),
         likes            = COALESCE(excluded.likes, content.likes),
         comments         = COALESCE(excluded.comments, content.comments),
         shares           = COALESCE(excluded.shares, content.shares),
         last_seen_run_id = excluded.last_seen_run_id,
         last_seen_at     = excluded.last_seen_at
       RETURNING first_seen_run_id`,
    )
    .get(
      item.platform,
      item.platformContentId,
      context.source,
      item.url,
      item.creatorHandle,
      item.caption,
      JSON.stringify(item.hashtags),
      item.mediaType,
      item.publishedAt,
      item.metrics.views,
      item.metrics.likes,
      item.metrics.comments,
      item.metrics.shares,
      context.matchedQuery,
      context.runId,
      context.runId,
      now,
      now,
    ) as { first_seen_run_id: number };
  return row.first_seen_run_id === context.runId ? 'inserted' : 'updated';
}
