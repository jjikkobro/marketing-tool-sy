/**
 * 관찰: 에이전트가 판단에 쓸 사실 목록을 DB에서 만든다.
 *
 * 모든 값은 SQL로 계산한다. LLM에게는 이 목록만 보여주고,
 * LLM은 factId로 사실을 가리킬 수만 있다. 값을 새로 만들어 낼 수는 없다.
 */
import type { Db } from '../db/database.ts';
import { adapterHealth, listRuns, relatedHashtags, topHashtags } from '../queries/index.ts';
import type { Fact } from '../schema.ts';

export const INSTAGRAM_HASHTAG_LIMIT = 30;
export const INSTAGRAM_HASHTAG_WINDOW_DAYS = 7;

export interface Observation {
  generatedAt: string;
  facts: Fact[];
}

/** null 값은 사실에 넣지 않는다. "모름"을 숫자로 바꾸지 않기 위해서다. */
function defined(values: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== null),
  );
}

export function instagramHashtagsUsed(db: Db, now: Date): string[] {
  const since = new Date(now.getTime() - INSTAGRAM_HASHTAG_WINDOW_DAYS * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT DISTINCT lower(query_value) AS tag FROM collection_run
        WHERE adapter_id = 'instagram-graph' AND query_kind = 'hashtag' AND started_at >= ?`,
    )
    .all(since) as Array<{ tag: string }>;
  return rows.map((row) => row.tag);
}

export function buildObservation(db: Db, now: Date = new Date()): Observation {
  const facts: Fact[] = [];
  const hashtags = topHashtags(db, { limit: 50 });

  for (const tag of hashtags) {
    facts.push({
      factId: `hashtag:${tag.hashtag}`,
      description: `#${tag.hashtag}가 붙은 수집 콘텐츠`,
      values: defined({ contents: tag.contents, totalViews: tag.totalViews }),
    });
  }

  for (const seed of hashtags.slice(0, 10)) {
    for (const other of relatedHashtags(db, seed.hashtag, { limit: 8 })) {
      facts.push({
        factId: `related:${seed.hashtag}>${other.hashtag}`,
        description: `#${seed.hashtag} 게시물 중 #${other.hashtag}도 함께 쓴 콘텐츠`,
        values: defined({ contents: other.contents, totalViews: other.totalViews }),
      });
    }
  }

  const lastHttpStatus = db.prepare(
    `SELECT http_status FROM collection_error WHERE run_id = ? AND http_status IS NOT NULL ORDER BY id DESC LIMIT 1`,
  );
  for (const run of listRuns(db, { limit: 20 })) {
    const status = lastHttpStatus.get(run.id) as { http_status: number } | undefined;
    facts.push({
      factId: `run:${run.id}`,
      description: `실행 #${run.id} ${run.adapterId} ${run.query.kind}:${run.query.value} → ${run.status}`,
      values: defined({
        pagesFetched: run.pagesFetched,
        itemsSeen: run.itemsSeen,
        inserted: run.inserted,
        duplicates: run.duplicates,
        rejected: run.rejected,
        retries: run.retries,
        lastHttpStatus: status?.http_status ?? null,
      }),
    });
  }

  for (const health of adapterHealth(db)) {
    facts.push({
      factId: `adapter:${health.adapterId}`,
      description: `${health.adapterId} 누적 실행 결과와 오류 종류별 건수`,
      values: {
        runs: health.runs,
        succeeded: health.succeeded,
        partial: health.partial,
        failed: health.failed,
        ...Object.fromEntries(
          Object.entries(health.errorsByKind).map(([kind, n]) => [`errors_${kind}`, n]),
        ),
      },
    });
  }

  facts.push({
    factId: 'quota:instagram-hashtags',
    description: `Instagram Graph API: ${INSTAGRAM_HASHTAG_WINDOW_DAYS}일 동안 조회할 수 있는 고유 해시태그 수`,
    values: {
      used: instagramHashtagsUsed(db, now).length,
      limit: INSTAGRAM_HASHTAG_LIMIT,
      windowDays: INSTAGRAM_HASHTAG_WINDOW_DAYS,
    },
  });

  return { generatedAt: now.toISOString(), facts };
}
