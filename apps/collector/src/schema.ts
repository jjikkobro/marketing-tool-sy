/**
 * 수집 도메인 스키마 (collector와 web이 함께 쓰는 유일한 계약)
 *
 * web은 이 파일만 `@studio/collector/schema`로 가져간다.
 * 그래서 이 파일은 DB나 Node API를 import하지 않는다.
 */
import { z } from 'zod';

export const platformSchema = z.enum(['tiktok', 'instagram', 'web']);
export type Platform = z.infer<typeof platformSchema>;

/** 어떤 경로로 수집했는지. 화면과 README에 출처 배지로 그대로 보여준다. */
export const sourceKindSchema = z.enum(['official-api', 'browser']);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const queryKindSchema = z.enum(['keyword', 'hashtag']);
export type QueryKind = z.infer<typeof queryKindSchema>;

export const collectQuerySchema = z.object({
  kind: queryKindSchema,
  value: z.string().trim().min(1),
});
export type CollectQuery = z.infer<typeof collectQuerySchema>;

/**
 * 지표는 "없음(null)"과 "0"을 구분한다.
 * 원본 운영에서 미수집 값이 0으로 저장되어 성과 판정이 틀어진 일이 있었다.
 */
const metricSchema = z.number().int().nonnegative().nullable();

export const metricsSchema = z.object({
  views: metricSchema,
  likes: metricSchema,
  comments: metricSchema,
  shares: metricSchema,
});
export type Metrics = z.infer<typeof metricsSchema>;

/** 플랫폼마다 다른 응답을 이 한 가지 모양으로 맞춘다. */
export const socialContentSchema = z.object({
  platform: platformSchema,
  platformContentId: z.string().min(1),
  url: z.string().url().nullable(),
  creatorHandle: z.string().nullable(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  mediaType: z.enum(['video', 'image', 'carousel', 'unknown']),
  publishedAt: z.iso.datetime(),
  metrics: metricsSchema,
});
export type SocialContent = z.infer<typeof socialContentSchema>;

export const runStatusSchema = z.enum(['running', 'succeeded', 'partial', 'failed']);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * 오류 분류. 재시도할지는 kind로 정한다 (core/errors.ts).
 * - truncated: 페이지 상한에 걸려 남은 데이터를 못 가져옴. 원본은 이걸 조용히 버렸다.
 */
export const errorKindSchema = z.enum([
  'rate_limited',
  'auth',
  'server',
  'network',
  'invalid_response',
  'schema_drift',
  'truncated',
  'unknown',
]);
export type ErrorKind = z.infer<typeof errorKindSchema>;

export const errorStageSchema = z.enum(['fetch', 'parse', 'store', 'drift']);
export type ErrorStage = z.infer<typeof errorStageSchema>;

export const severitySchema = z.enum(['error', 'warning']);
export type Severity = z.infer<typeof severitySchema>;

export const collectionRunSchema = z.object({
  id: z.number().int(),
  adapterId: z.string(),
  platform: platformSchema,
  source: sourceKindSchema,
  query: collectQuerySchema,
  status: runStatusSchema,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  pagesFetched: z.number().int(),
  itemsSeen: z.number().int(),
  inserted: z.number().int(),
  updated: z.number().int(),
  duplicates: z.number().int(),
  rejected: z.number().int(),
  retries: z.number().int(),
});
export type CollectionRun = z.infer<typeof collectionRunSchema>;

export const collectionErrorSchema = z.object({
  id: z.number().int(),
  runId: z.number().int(),
  stage: errorStageSchema,
  kind: errorKindSchema,
  severity: severitySchema,
  message: z.string(),
  httpStatus: z.number().int().nullable(),
  attempt: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export type CollectionError = z.infer<typeof collectionErrorSchema>;

export const storedContentSchema = socialContentSchema.extend({
  matchedQuery: z.string(),
  source: sourceKindSchema,
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});
export type StoredContent = z.infer<typeof storedContentSchema>;

export const adapterHealthSchema = z.object({
  adapterId: z.string(),
  platform: platformSchema,
  source: sourceKindSchema,
  runs: z.number().int(),
  succeeded: z.number().int(),
  partial: z.number().int(),
  failed: z.number().int(),
  lastStatus: runStatusSchema.nullable(),
  lastFinishedAt: z.iso.datetime().nullable(),
  errorsByKind: z.record(z.string(), z.number().int()),
});
export type AdapterHealth = z.infer<typeof adapterHealthSchema>;

export const hashtagStatSchema = z.object({
  hashtag: z.string(),
  contents: z.number().int(),
  totalViews: z.number().int().nullable(),
});
export type HashtagStat = z.infer<typeof hashtagStatSchema>;

/** web이 읽는 정적 스냅샷 (collector export가 만든다). */
export const snapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  scenario: z.string(),
  runs: z.array(collectionRunSchema),
  errors: z.array(collectionErrorSchema),
  health: z.array(adapterHealthSchema),
  contents: z.array(storedContentSchema),
  hashtags: z.array(hashtagStatSchema),
  /** 상위 해시태그별 관련 해시태그 (queries/relatedHashtags 결과). 웹에서 다시 계산하지 않는다. */
  related: z.record(z.string(), z.array(hashtagStatSchema)),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
