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

/* ── 에이전트 제안 ─────────────────────────────────────────────── */

/**
 * 관찰 사실(fact). LLM이 근거로 인용할 수 있는 것은 이 목록에 있는 사실뿐이다.
 * 값은 모두 SQL로 계산한 것이고, LLM은 factId로만 가리킨다.
 */
export const factSchema = z.object({
  factId: z.string(),
  description: z.string(),
  values: z.record(z.string(), z.number()),
});
export type Fact = z.infer<typeof factSchema>;

export const proposalKindSchema = z.enum(['collect_query', 'retry_run', 'operator_action']);
export type ProposalKind = z.infer<typeof proposalKindSchema>;

/** LLM(또는 MCP 클라이언트)이 내는 제안 초안. 아직 아무것도 검증되지 않은 상태다. */
export const proposalDraftSchema = z.object({
  kind: proposalKindSchema,
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(600),
  /** collect_query: 어떤 어댑터로 무엇을 수집할지 */
  adapterId: z.string().nullable(),
  queryKind: queryKindSchema.nullable(),
  queryValue: z.string().nullable(),
  /** retry_run: 다시 돌릴 실행 번호 */
  runId: z.number().int().nullable(),
  /** 근거로 인용한 사실 ID */
  evidence: z.array(z.string()),
  /** 근거에서 인용한 수치. 가드가 SQL 값과 하나씩 대조한다. */
  claims: z.array(z.object({ factId: z.string(), field: z.string(), value: z.number() })),
});
export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

export const guardCheckSchema = z.object({
  check: z.enum([
    'schema',
    'evidence',
    'claims',
    'grounded_numbers',
    'target',
    'capability',
    'duplicate',
    'quota',
  ]),
  passed: z.boolean(),
  detail: z.string(),
});
export type GuardCheck = z.infer<typeof guardCheckSchema>;

/**
 * 제안 상태
 * - blocked: 가드(결정적 검증)를 통과하지 못함. 사람에게 승인 요청 자체가 가지 않는다
 * - pending: 가드 통과, 사람의 판단을 기다림
 * - approved → executed | failed: 사람이 승인해 실행함
 * - rejected: 사람이 거절함
 * - acknowledged: 실행할 수 없는 운영 조치(operator_action)를 사람이 확인함
 */
export const proposalStatusSchema = z.enum([
  'blocked',
  'pending',
  'approved',
  'executed',
  'failed',
  'rejected',
  'acknowledged',
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalSchema = proposalDraftSchema.extend({
  id: z.number().int(),
  status: proposalStatusSchema,
  proposedBy: z.string(),
  createdAt: z.iso.datetime(),
  checks: z.array(guardCheckSchema),
  reviewer: z.string().nullable(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  resultRunId: z.number().int().nullable(),
  /** 승인 후 실행 중 난 오류. 사람이 쓴 결정 사유(reviewNote)를 덮어쓰지 않도록 따로 둔다. */
  executionError: z.string().nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** web이 읽는 데이터 (collector export 또는 serve가 만든다). */
export const snapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  scenario: z.string(),
  /**
   * recorded: 녹화 응답으로 돌린 데모라 URL이 실제로 열리지 않는다. 화면은 링크를 걸지 않는다.
   * live: 실서비스에서 수집한 데이터.
   */
  dataMode: z.enum(['recorded', 'live']),
  runs: z.array(collectionRunSchema),
  errors: z.array(collectionErrorSchema),
  health: z.array(adapterHealthSchema),
  contents: z.array(storedContentSchema),
  hashtags: z.array(hashtagStatSchema),
  /** 상위 해시태그별 관련 해시태그 (queries/relatedHashtags 결과). 웹에서 다시 계산하지 않는다. */
  related: z.record(z.string(), z.array(hashtagStatSchema)),
  proposals: z.array(proposalSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/* ── 라이브 데모 상태 ─────────────────────────────────────────── */

/** 지금 화면에서 무엇이 실시간이고 무엇이 녹화인지. 화면에 그대로 보여준다. */
export const liveStatusSchema = z.object({
  claude: z.object({
    enabled: z.boolean(),
    model: z.string().nullable(),
    remainingToday: z.number().int(),
    remainingForSession: z.number().int(),
  }),
  sns: z.enum(['recorded', 'live']),
  browserSeeded: z.boolean(),
  sessionStartedAt: z.iso.datetime(),
});
export type LiveStatus = z.infer<typeof liveStatusSchema>;

export const planResponseSchema = z.object({
  plannerId: z.string(),
  live: z.boolean(),
  fallbackReason: z.string().nullable(),
  proposalIds: z.array(z.number().int()),
  elapsedMs: z.number().int(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;
