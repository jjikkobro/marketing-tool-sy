/**
 * 관찰: 에이전트가 판단에 쓸 사실 목록을 DB에서 만든다.
 *
 * 모든 값은 SQL로 계산한다. LLM에게는 이 목록만 보여주고, LLM은 factId로 사실을 가리킬 수만 있다.
 * 사람의 최근 결정(거절 사유 포함)도 함께 넘겨, 같은 제안을 반복하지 않게 한다 (피드백).
 */
import type { Db } from '../db/database.ts';
import { FORMAT_LABEL, isFormatId } from '../core/format.ts';
import {
  adapterHealth,
  formatStats,
  getRun,
  listRuns,
  relatedHashtags,
  topHashtags,
} from '../queries/index.ts';
import type { CollectionRun, Fact } from '../schema.ts';

export const INSTAGRAM_HASHTAG_LIMIT = 30;
export const INSTAGRAM_HASHTAG_WINDOW_DAYS = 7;

export interface RecentDecision {
  proposalId: number;
  status: 'rejected' | 'blocked' | 'executed' | 'failed';
  title: string;
  /** 거절 사유 또는 가드 차단 사유 */
  reason: string | null;
}

export interface OpenProposal {
  proposalId: number;
  kind: string;
  title: string;
  target: string | null;
}

export interface Observation {
  generatedAt: string;
  facts: Fact[];
  recentDecisions: RecentDecision[];
  /** 이미 사람의 검토를 기다리는 제안. 같은 내용을 다시 내지 않도록 계획자에게 보여준다 */
  openProposals: OpenProposal[];
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

function runFact(db: Db, run: CollectionRun): Fact {
  const status = db
    .prepare(
      `SELECT http_status FROM collection_error WHERE run_id = ? AND http_status IS NOT NULL ORDER BY id DESC LIMIT 1`,
    )
    .get(run.id) as { http_status: number } | undefined;
  return {
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
  };
}

function quotaFact(db: Db, now: Date): Fact {
  return {
    factId: 'quota:instagram-hashtags',
    description: `Instagram Graph API: ${INSTAGRAM_HASHTAG_WINDOW_DAYS}일 동안 조회할 수 있는 고유 해시태그 수`,
    values: {
      used: instagramHashtagsUsed(db, now).length,
      limit: INSTAGRAM_HASHTAG_LIMIT,
      windowDays: INSTAGRAM_HASHTAG_WINDOW_DAYS,
    },
  };
}

function formatFact(stat: { format: string; contents: number; totalViews: number | null }): Fact {
  const label = isFormatId(stat.format) ? FORMAT_LABEL[stat.format] : stat.format;
  return {
    factId: `format:${stat.format}`,
    description: `${label} 포맷 콘텐츠 (YouTube 제외 집계, 규칙 기반 분류)`,
    values: defined({ contents: stat.contents, totalViews: stat.totalViews }),
  };
}

/**
 * YouTube 영상 하나. YouTube가 준 값 그대로이며, 다른 영상과 합친 값은 만들지 않는다 (정책 III.E.2, III.E.4.h).
 */
function youtubeVideoFact(db: Db, videoId: string): Fact | null {
  const row = db
    .prepare(
      `SELECT caption, creator_handle, views, likes, comments FROM content
        WHERE platform = 'youtube' AND platform_content_id = ?`,
    )
    .get(videoId) as
    | {
        caption: string;
        creator_handle: string | null;
        views: number | null;
        likes: number | null;
        comments: number | null;
      }
    | undefined;
  return row
    ? {
        factId: `video:youtube:${videoId}`,
        description: `YouTube 영상 "${row.caption.slice(0, 80)}" (${row.creator_handle ?? '채널 미상'}, YouTube 제공 값)`,
        values: defined({ views: row.views, likes: row.likes, comments: row.comments }),
      }
    : null;
}

/**
 * factId 하나를 DB에서 직접 계산한다. 관찰 목록은 "상위 N개"로 잘려 있어서,
 * 그 밖으로 밀려난 근거를 가드가 "없는 사실"로 오판하지 않도록 쓴다.
 */
export function factById(db: Db, factId: string, now: Date = new Date()): Fact | null {
  const [type, key] = [factId.slice(0, factId.indexOf(':')), factId.slice(factId.indexOf(':') + 1)];

  if (type === 'run' && /^\d+$/.test(key)) {
    const run = getRun(db, Number(key));
    return run ? runFact(db, run) : null;
  }
  if (type === 'hashtag' && key) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS contents, SUM(c.views) AS totalViews
           FROM content c, json_each(c.hashtags) tag WHERE tag.value = ?`,
      )
      .get(key) as { contents: number; totalViews: number | null };
    return row.contents === 0
      ? null
      : {
          factId,
          description: `#${key}가 붙은 수집 콘텐츠`,
          values: defined({ contents: row.contents, totalViews: row.totalViews }),
        };
  }
  if (type === 'related' && key.includes('>')) {
    const [seed = '', other = ''] = key.split('>');
    const hit = relatedHashtags(db, seed, { limit: 1_000 }).find((r) => r.hashtag === other);
    return hit
      ? {
          factId,
          description: `#${seed} 게시물 중 #${other}도 함께 쓴 콘텐츠`,
          values: defined({ contents: hit.contents, totalViews: hit.totalViews }),
        }
      : null;
  }
  if (type === 'format') {
    const stat = formatStats(db).find((f) => f.format === key);
    return stat ? formatFact(stat) : null;
  }
  if (type === 'video' && key.startsWith('youtube:'))
    return youtubeVideoFact(db, key.slice('youtube:'.length));
  if (type === 'adapter') {
    const health = adapterHealth(db).find((h) => h.adapterId === key);
    return health
      ? {
          factId,
          description: `${key} 누적 실행 결과와 오류 종류별 건수`,
          values: {
            runs: health.runs,
            succeeded: health.succeeded,
            partial: health.partial,
            failed: health.failed,
            ...Object.fromEntries(
              Object.entries(health.errorsByKind).map(([kind, n]) => [`errors_${kind}`, n]),
            ),
          },
        }
      : null;
  }
  if (factId === 'quota:instagram-hashtags') return quotaFact(db, now);
  return null;
}

function openProposals(db: Db): OpenProposal[] {
  const rows = db
    .prepare(
      `SELECT id, kind, title, adapter_id, query_kind, query_value, run_id, json_extract(plan, '$.format') AS format
         FROM agent_proposal WHERE status = 'pending' ORDER BY id DESC LIMIT 20`,
    )
    .all() as Array<{
    id: number;
    kind: string;
    title: string;
    adapter_id: string | null;
    query_kind: string | null;
    query_value: string | null;
    run_id: number | null;
    format: string | null;
  }>;
  return rows.map((row) => ({
    proposalId: row.id,
    kind: row.kind,
    title: row.title,
    target: row.query_value
      ? `${row.adapter_id} ${row.query_kind}:${row.query_value}`
      : row.run_id !== null
        ? `run:${row.run_id}`
        : row.format
          ? `format:${row.format}`
          : null,
  }));
}

function recentDecisions(db: Db): RecentDecision[] {
  const rows = db
    .prepare(
      `SELECT id, status, title, review_note, checks FROM agent_proposal
        WHERE status IN ('rejected', 'blocked', 'executed', 'failed')
        ORDER BY id DESC LIMIT 20`,
    )
    .all() as Array<{
    id: number;
    status: RecentDecision['status'];
    title: string;
    review_note: string | null;
    checks: string;
  }>;
  return rows.map((row) => ({
    proposalId: row.id,
    status: row.status,
    title: row.title,
    reason:
      row.status === 'blocked'
        ? (JSON.parse(row.checks) as Array<{ passed: boolean; detail: string }>)
            .filter((c) => !c.passed)
            .map((c) => c.detail)
            .join(' / ')
        : row.review_note,
  }));
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

  for (const run of listRuns(db, { limit: 20 })) facts.push(runFact(db, run));

  for (const health of adapterHealth(db)) {
    const fact = factById(db, `adapter:${health.adapterId}`, now);
    if (fact) facts.push(fact);
  }

  for (const stat of formatStats(db)) facts.push(formatFact(stat));

  const videos = db
    .prepare(
      `SELECT platform_content_id AS id FROM content WHERE platform = 'youtube'
        ORDER BY views IS NULL, views DESC LIMIT 15`,
    )
    .all() as Array<{ id: string }>;
  for (const video of videos) {
    const fact = youtubeVideoFact(db, video.id);
    if (fact) facts.push(fact);
  }

  facts.push(quotaFact(db, now));
  return {
    generatedAt: now.toISOString(),
    facts,
    recentDecisions: recentDecisions(db),
    openProposals: openProposals(db),
  };
}
