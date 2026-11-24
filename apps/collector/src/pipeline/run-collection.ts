/**
 * 수집 실행 한 번: 페이지 수집 → 파싱 → 중복 제거 → 저장 → 플랫폼 변화 점검 → 실행 기록.
 *
 * 원본(legacy/src/pipeline/social/collectors.js)과 다른 점
 * - 재시도: 원본 수집기에는 재시도가 없었다. 429·5xx·네트워크 오류는 백오프 후 다시 시도하고, 401은 즉시 멈춘다.
 * - 부분 실패: 중간 페이지에서 멈춰도 이미 받은 데이터는 저장하고, 상태를 partial로 남긴다.
 * - 잘림 기록: 원본의 pagedGet은 maxPages에 닿으면 남은 페이지를 조용히 버렸다. 여기서는 truncated 경고로 남긴다.
 * - 식별 불가 항목: 하나로 합치지 않고 rejected로 센다 (core/identity.ts).
 */
import { detectDrift, fieldFillRates } from '../core/drift.ts';
import { contentKey } from '../core/identity.ts';
import { purgeExpiredYouTube } from '../core/youtube-policy.ts';
import { defaultSleep, RetryExhaustedError, withRetry, type RetryOptions } from '../core/retry.ts';
import type { SourceAdapter } from '../adapters/types.ts';
import type { Db } from '../db/database.ts';
import {
  finishRun,
  previousFieldStats,
  recordError,
  startRun,
  upsertContent,
  type RunCounters,
} from '../db/repository.ts';
import type { CollectQuery, RunStatus, SocialContent } from '../schema.ts';
import { CollectorError, toCollectorError } from '../core/errors.ts';

export interface RunOptions {
  maxPages?: number;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
}

export interface RunResult {
  runId: number;
  status: Exclude<RunStatus, 'running'>;
  counters: RunCounters;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  sleep: defaultSleep,
  random: Math.random,
};

export async function runCollection(
  db: Db,
  adapter: SourceAdapter,
  query: CollectQuery,
  options: RunOptions = {},
): Promise<RunResult> {
  const now = options.now ?? (() => new Date());
  const maxPages = options.maxPages ?? 10;
  // YouTube 정책 III.E.4: 저장 30일이 지난 데이터는 갱신하거나 지운다. 수집할 때마다 먼저 정리한다.
  if (adapter.platform === 'youtube') purgeExpiredYouTube(db, now());

  const runId = startRun(db, {
    adapterId: adapter.id,
    platform: adapter.platform,
    source: adapter.source,
    query,
    now: now(),
  });

  const counters: RunCounters = {
    pagesFetched: 0,
    itemsSeen: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    rejected: 0,
    retries: 0,
  };
  const seenKeys = new Set<string>();
  const loggedWarnings = new Set<string>();
  const stored: SocialContent[] = [];
  let fatal = false;
  let cursor: string | null = null;

  const log = (entry: Omit<Parameters<typeof recordError>[2], 'now'>) =>
    recordError(db, runId, { ...entry, now: now() });

  const retryOptions: RetryOptions = {
    ...DEFAULT_RETRY,
    ...options.retry,
    onRetry: (error, attempt, delayMs) => {
      counters.retries += 1;
      log({
        stage: 'fetch',
        kind: error.kind,
        severity: 'warning',
        message: `${error.message} → ${delayMs}ms 후 재시도`,
        httpStatus: error.httpStatus,
        attempt,
      });
    },
  };

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      let body: string;
      try {
        ({ value: body } = await withRetry(() => adapter.fetchPage(query, cursor), retryOptions));
      } catch (raw) {
        const error = raw instanceof RetryExhaustedError ? raw.last : toCollectorError(raw);
        const attempts = raw instanceof RetryExhaustedError ? raw.attempts : 1;
        log({
          stage: 'fetch',
          kind: error.kind,
          severity: 'error',
          message: `${page}페이지 수집 중단: ${error.message}`,
          httpStatus: error.httpStatus,
          attempt: attempts,
        });
        fatal = true;
        break;
      }
      counters.pagesFetched += 1;

      let parsed;
      try {
        parsed = adapter.parsePage(body, query);
      } catch (raw) {
        const error = raw instanceof CollectorError ? raw : toCollectorError(raw);
        log({
          stage: 'parse',
          kind: error.kind,
          severity: 'error',
          message: `${page}페이지 파싱 실패: ${error.message}`,
        });
        fatal = true;
        break;
      }

      for (const warning of parsed.warnings) {
        // 같은 경고가 페이지마다 반복되면 한 번만 남긴다. 실행 기록이 같은 문장으로 도배되지 않게 하기 위해서다.
        if (loggedWarnings.has(warning.message)) continue;
        loggedWarnings.add(warning.message);
        log({ stage: 'parse', kind: warning.kind, severity: 'warning', message: warning.message });
      }
      for (const rejection of parsed.rejected) {
        counters.rejected += 1;
        log({
          stage: 'parse',
          kind: 'invalid_response',
          severity: 'warning',
          message: `항목 제외: ${rejection.reason} — ${rejection.sample}`,
        });
      }

      db.transaction(() => {
        for (const item of parsed.items) {
          counters.itemsSeen += 1;
          const key = contentKey(item.platform, item);
          if (key === null) {
            counters.rejected += 1;
            continue;
          }
          if (seenKeys.has(key)) {
            counters.duplicates += 1;
            continue;
          }
          seenKeys.add(key);
          const outcome = upsertContent(db, item, {
            runId,
            source: adapter.source,
            matchedQuery: `${query.kind}:${query.value}`,
            now: now(),
          });
          counters[outcome] += 1;
          stored.push(item);
        }
      })();

      cursor = parsed.nextCursor;
      if (cursor === null) break;
      if (page === maxPages) {
        log({
          stage: 'fetch',
          kind: 'truncated',
          severity: 'warning',
          message: `페이지 상한(${maxPages})에 도달해 남은 결과를 가져오지 않았습니다`,
        });
      }
    }
  } catch (raw) {
    // 예상하지 못한 오류(DB 등)여도 실행을 running으로 남기지 않는다. 남기면 부분 UNIQUE 인덱스가 다음 실행을 영구히 막는다.
    const error = toCollectorError(raw);
    log({
      stage: 'store',
      kind: error.kind,
      severity: 'error',
      message: `실행 중단: ${error.message}`,
    });
    finishRun(db, runId, { status: 'failed', counters, fieldStats: {}, now: now() });
    throw raw;
  }

  const fieldStats = fieldFillRates(stored);
  for (const finding of detectDrift(
    previousFieldStats(db, adapter.id, runId),
    fieldStats,
    stored.length,
  )) {
    log({
      stage: 'drift',
      kind: 'schema_drift',
      severity: 'warning',
      message: `'${finding.field}' 필드 채움 비율 ${pct(finding.before)} → ${pct(finding.after)}. 응답 구조가 바뀌었을 수 있습니다`,
    });
  }

  // 받은 항목이 하나라도 있으면 partial이다. 페이지는 받았지만 파싱에서 막혀 아무것도 못 얻었다면 failed다.
  const status: RunResult['status'] = !fatal
    ? 'succeeded'
    : counters.itemsSeen > 0
      ? 'partial'
      : 'failed';
  finishRun(db, runId, { status, counters, fieldStats, now: now() });
  return { runId, status, counters };
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
