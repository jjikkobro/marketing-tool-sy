/**
 * 가드: LLM 제안을 사람에게 보여주기 전에 결정적으로 검증한다.
 *
 * 원칙: LLM은 제안과 문장을 만들고, 숫자는 SQL이 만든다.
 * - 근거(evidence)는 DB에 실제로 있는 사실이어야 한다.
 * - 수치 주장(claims)은 그 사실의 SQL 값과 정확히 같아야 한다.
 * - 문장에 쓸 수 있는 숫자는 검증을 통과한 claims 값뿐이다. 단위 변환(만·배·%)과 한글 수사는 쓸 수 없다.
 * - 실행 대상(쿼리, 재실행 번호)은 인용한 근거와 일치해야 한다. 제목과 실제 실행 대상이 어긋나는 것을 막는다.
 * - 실행할 수 있는지, 중복인지(사람이 거절한 이력 포함), API 쿼터를 넘지 않는지 확인한다.
 *
 * 하나라도 실패하면 blocked가 되고 사람에게 승인 요청이 가지 않는다.
 * 레드팀 검토에서 재현된 우회 12가지가 test/agent.test.ts에 회귀 테스트로 있다 (docs/decisions/0004).
 */
import type { Db } from '../db/database.ts';
import type { Fact, GuardCheck, ProposalDraft, QueryKind } from '../schema.ts';
import { proposalDraftSchema } from '../schema.ts';
import { YOUTUBE_DAILY_SEARCH_LIMIT, youtubeSearchesToday } from '../core/youtube-policy.ts';
import { collectUnavailableReason } from './availability.ts';
import { SEARCH_DAILY_LIMIT, webSearchesToday } from './search-quota.ts';
import {
  factById,
  INSTAGRAM_HASHTAG_LIMIT,
  instagramHashtagsUsed,
  type Observation,
} from './observation.ts';

/** 에이전트가 실행을 제안할 수 있는 어댑터와 지원하는 쿼리 종류 */
export const AGENT_ADAPTERS: Record<string, readonly QueryKind[]> = {
  'tiktok-research': ['keyword', 'hashtag'],
  'instagram-graph': ['hashtag'],
  'youtube-data': ['keyword', 'hashtag'],
  'search-tiktok': ['keyword', 'hashtag'],
  'search-instagram': ['keyword', 'hashtag'],
};

const RECENT_COLLECTION_HOURS = 24;
const REJECTION_MEMORY_DAYS = 7;

export interface GuardResult {
  passed: boolean;
  checks: GuardCheck[];
}

export interface GuardOptions {
  /** 승인 시점 재검증에서 자기 자신을 중복으로 세지 않도록 뺀다 */
  excludeProposalId?: number;
  /** 레퍼런스 기반 기획: 이 중 하나 이상을 근거로 인용해야 한다 (마케터가 고른 레퍼런스) */
  requiredEvidence?: readonly string[];
}

/* ── 정규화 ─────────────────────────────────────────────────────── */

/** 전각 숫자(１２０)와 호환 문자를 일반 형태로 바꾼다 */
const nfkc = (text: string) => text.normalize('NFKC');

/** 쿼리 값을 저장·비교 기준 형태로 맞춘다. 대소문자, 앞뒤 공백, # 때문에 중복 검사를 빠져나가지 못하게 한다. */
export function normalizeQueryValue(kind: QueryKind, value: string): string {
  const base = nfkc(value).trim().toLowerCase();
  return kind === 'hashtag'
    ? base.replace(/^#+/, '').replace(/\s+/g, '')
    : base.replace(/\s+/g, ' ');
}

/** 키워드를 해시태그 형태로 바꾼다 ("fire noodle" → "firenoodle"). 키워드 근거를 해시태그 사실과 맞출 때 쓴다. */
const asTag = (value: string) => value.replace(/\s+/g, '');

/**
 * 제안을 종류별 정체(identity)만 남긴 형태로 맞춘다.
 * - 재실행(retry_run)의 대상은 실행 번호 하나다. 실제 Claude가 재실행 제안에 adapterId를 덧붙여
 *   같은 실행 #4의 재실행이 "다른 제안"으로 판정되어 중복 검사를 통과한 일이 있었다 (docs/decisions/0002 §7).
 *   실행 대상은 어차피 실행 기록에서 정해지므로, 덧붙인 필드는 버린다. 사람에게 엉뚱한 어댑터가 보이는 것도 막는다.
 * - 새 수집(collect_query)에는 실행 번호가 없다.
 */
function normalizeDraft(draft: ProposalDraft): ProposalDraft {
  const text = { title: nfkc(draft.title).trim(), rationale: nfkc(draft.rationale).trim() };
  if (draft.kind === 'retry_run') {
    return { ...draft, ...text, adapterId: null, queryKind: null, queryValue: null, plan: null };
  }
  if (draft.kind === 'content_brief') {
    // 기획안은 실행하지 않는다. 실행 대상 필드는 버리고, 포맷 이름은 소문자로 맞춘다
    const plan = draft.plan && {
      ...draft.plan,
      format: nfkc(draft.plan.format).trim().toLowerCase(),
    };
    return {
      ...draft,
      ...text,
      adapterId: null,
      queryKind: null,
      queryValue: null,
      runId: null,
      plan,
    };
  }
  return {
    ...draft,
    ...text,
    runId: draft.kind === 'collect_query' ? null : draft.runId,
    plan: null,
    queryValue:
      draft.queryValue !== null && draft.queryKind !== null
        ? normalizeQueryValue(draft.queryKind, draft.queryValue)
        : draft.queryValue,
  };
}

/* ── 문장 속 숫자 ───────────────────────────────────────────────── */

const RUN_REFERENCE = /(?:실행|run)\s*#(\d+)/giu;
/** 기획 사양 칸에서 막는 "데이터처럼 보이는 숫자": 조회·좋아요·건·명·회 같은 측정 단위가 붙은 수 */
const DATA_COUNT =
  /\d[\d,.]*\s*(?:회|건|명|뷰|views?|likes?|comments?)|(?:조회|좋아요|댓글|저장|공유|팔로워)\D{0,4}\d/iu;
/** 문자로 시작하는 해시태그만 지운다. "#240%"나 "#1위"처럼 #으로 숫자를 숨기는 것은 숫자로 본다. */
const WORD_HASHTAG = /#[\p{L}_][\p{L}\p{N}_]*/gu;
/** 숫자 뒤에 붙으면 다른 값으로 바뀌는 단위·비율 표현. 이런 값은 SQL이 계산한 적이 없다. */
const DERIVED_SUFFIX = /\d[\d,.]*\s*(?:만|억|천|배|%|퍼센트|프로|x\b|k\b|m\b)/iu;
/** 한글로 쓴 수. 형식이 다양해 검증할 수 없으므로 쓰지 못하게 한다. */
const KOREAN_NUMERAL =
  /(?:[일이삼사오육칠팔구]?[십백천만억]+[일이삼사오육칠팔구십백천만억]*|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|수십|수백|수천|수만)\s*(?:건|회|배|개|명|퍼센트|프로|%)/u;

export interface NumberScan {
  numbers: number[];
  runReferences: number[];
  derived: string | null;
  koreanNumeral: string | null;
}

export function scanNumbers(rawText: string): NumberScan {
  const text = nfkc(rawText);
  const runReferences = [...text.matchAll(RUN_REFERENCE)].map((m) => Number(m[1]));
  const rest = text.replace(RUN_REFERENCE, ' ').replace(WORD_HASHTAG, ' ');
  return {
    numbers: [...rest.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(',', ''))),
    runReferences,
    derived: DERIVED_SUFFIX.exec(rest)?.[0] ?? null,
    koreanNumeral: KOREAN_NUMERAL.exec(rest)?.[0] ?? null,
  };
}

/** 이전 버전과의 호환을 위한 단순 추출 (테스트에서 사용) */
export function extractNumbers(text: string): number[] {
  return scanNumbers(text).numbers;
}

/**
 * 제작 사양 글(기획안 plan, 콘텐츠 초안)의 숫자 규칙: "데이터처럼 보이는 숫자"만 막는다.
 * "3초", "장면 4개" 같은 제작 사양은 허용하고, 측정 단위가 붙은 수·단위 변환·한글 수·claims에 없는 큰 수는 막는다.
 */
export function specNumberProblems(
  rawText: string,
  allowed: ReadonlySet<number>,
  where: string,
): string[] {
  const problems: string[] = [];
  const scan = scanNumbers(rawText);
  const text = nfkc(rawText).replace(WORD_HASHTAG, ' ');
  if (scan.derived) problems.push(`${where}에 단위 변환·비율 표현: "${scan.derived}"`);
  if (scan.koreanNumeral) problems.push(`${where}에 한글로 쓴 수: "${scan.koreanNumeral}"`);
  const dataCount = DATA_COUNT.exec(text)?.[0];
  if (dataCount) problems.push(`${where}에 데이터 수치처럼 보이는 숫자: "${dataCount}"`);
  const large = [...new Set(scan.numbers.filter((n) => n >= 100 && !allowed.has(n)))];
  if (large.length > 0) problems.push(`${where}에 claims에 없는 큰 숫자: ${large.join(', ')}`);
  return problems;
}

/* ── 검증 ───────────────────────────────────────────────────────── */

export function verifyProposal(
  db: Db,
  observation: Observation,
  raw: unknown,
  now: Date = new Date(),
  options: GuardOptions = {},
): GuardResult & { draft: ProposalDraft | null } {
  const parsed = proposalDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      passed: false,
      draft: null,
      checks: [
        {
          check: 'schema',
          passed: false,
          detail: `형식 오류: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        },
      ],
    };
  }
  const draft = normalizeDraft(parsed.data);

  // 관찰 목록에 없는 근거도 DB에서 직접 찾는다. 승인 시점 재검증에서 근거가 "최근 N개" 범위 밖으로 밀려나도
  // 할루시네이션으로 오판하지 않게 하기 위해서다.
  const known = new Map<string, Fact>(observation.facts.map((fact) => [fact.factId, fact]));
  const facts = new Map<string, Fact>();
  for (const id of draft.evidence) {
    const fact = known.get(id) ?? factById(db, id, now);
    if (fact) facts.set(id, fact);
  }

  const checks: GuardCheck[] = [
    { check: 'schema', passed: true, detail: '형식 일치' },
    checkEvidence(draft, facts),
    checkClaims(draft, facts),
    checkGroundedNumbers(draft, facts),
    checkTarget(draft, options),
    checkCapability(db, draft),
    checkDuplicate(db, draft, now, options),
    checkQuota(db, draft, now),
  ];
  return { passed: checks.every((c) => c.passed), checks, draft };
}

function checkEvidence(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  if (draft.evidence.length === 0) {
    return { check: 'evidence', passed: false, detail: '근거로 인용한 사실이 없습니다' };
  }
  const missing = draft.evidence.filter((id) => !facts.has(id));
  return missing.length === 0
    ? { check: 'evidence', passed: true, detail: `근거 ${draft.evidence.length}개 모두 DB에 있음` }
    : { check: 'evidence', passed: false, detail: `DB에 없는 근거: ${missing.join(', ')}` };
}

function checkClaims(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  const problems: string[] = [];
  for (const claim of draft.claims) {
    if (!draft.evidence.includes(claim.factId)) {
      problems.push(`${claim.factId}는 근거 목록에 없음`);
      continue;
    }
    const actual = facts.get(claim.factId)?.values[claim.field];
    if (actual === undefined)
      problems.push(`${claim.factId}.${claim.field} 값이 없음 (주장 ${claim.value})`);
    else if (actual !== claim.value) {
      problems.push(`${claim.factId}.${claim.field}: 주장 ${claim.value}, 실제 ${actual}`);
    }
  }
  return problems.length === 0
    ? {
        check: 'claims',
        passed: true,
        detail: `수치 주장 ${draft.claims.length}개 모두 SQL 값과 일치`,
      }
    : { check: 'claims', passed: false, detail: problems.join(' / ') };
}

/**
 * 문장에 쓴 숫자는 claims에 적은 값이어야 한다(값 자체는 checkClaims가 SQL과 대조한다).
 * "인용한 사실의 아무 필드 값"까지 허용하던 이전 규칙은 다른 필드·다른 사실의 숫자를 빌려 쓰는 우회를 허용했다.
 */
/** 따옴표로 감싼 인용. 짧은 인용('3')으로 숫자를 숨기지 못하게 8자 이상, 글자가 섞인 것만 본다 */
const QUOTED = /['"‘’“”「」]([^'"‘’“”「」]{8,})['"‘’“”「」]/g;

/**
 * 근거로 인용한 사실의 원문(영상 제목 등)을 그대로 따옴표로 옮긴 부분은 숫자 검사에서 뺀다.
 * 실제 Claude 출력에서 'Ranking … (Part 3)' 같은 제목 인용의 "3"이 근거 없는 숫자로 차단됐다 (0002 §10).
 * DB에 있는 원문과 글자 그대로 같을 때만 빼므로, 지어낸 숫자를 따옴표로 감싸 통과시킬 수는 없다.
 */
function stripVerifiedQuotes(text: string, citedTexts: readonly string[]): string {
  return text.replace(QUOTED, (whole, inner: string) => {
    const quote = inner.trim();
    return /\p{L}/u.test(quote) && citedTexts.some((source) => source.includes(quote))
      ? ' '
      : whole;
  });
}

/** 글자와 숫자가 섞인 식별자 (작성자 핸들 sj.1_17, 채널명 등) */
const IDENTIFIER = /[\p{L}\p{N}._@-]{3,}/gu;

/**
 * 근거로 인용한 사실의 원문에 들어 있는 식별자는 숫자 검사에서 뺀다.
 * 실제 Claude 출력에서 레퍼런스 작성자 핸들 "sj.1_17"의 1·17이 근거 없는 숫자로 차단됐다 (0002 §12).
 * DB 원문에 있는 식별자 문자열 통째로만 빼므로, "조회 17"처럼 숫자만 떼어 쓰면 그대로 막힌다.
 */
function stripCitedIdentifiers(text: string, citedTexts: readonly string[]): string {
  const identifiers = new Set(
    citedTexts.flatMap((source) =>
      [...source.matchAll(IDENTIFIER)]
        .map((m) => m[0].replace(/^[._@-]+|[._@-]+$/g, ''))
        .filter((token) => /\p{L}/u.test(token) && /\d/.test(token)),
    ),
  );
  let result = text;
  // 긴 것부터 지워야 "abc_12"가 "abc_123"의 일부만 지우지 않는다
  for (const token of [...identifiers].sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(token, ' ');
  }
  return result;
}

function checkGroundedNumbers(draft: ProposalDraft, facts: Map<string, Fact>): GuardCheck {
  const allowed = new Set(draft.claims.map((claim) => claim.value));
  const problems: string[] = [];
  // 인용한 사실의 설명과 factId 자체. Claude가 "video:youtube:0hnvjre3ebg"처럼 factId를 문장에 쓰기도 한다 (0002 §12)
  const citedTexts = draft.evidence.flatMap((id) => {
    const fact = facts.get(id);
    return fact ? [fact.description, id] : [];
  });

  // 1) 제목·근거 문장: 숫자는 검증된 claims 값만 쓸 수 있다
  // 근거로 인용한(그리고 DB에 있는) factId를 문장에 그대로 쓴 부분은 지운다.
  // TikTok 영상 ID처럼 숫자로만 된 ID도 있어서 식별자 규칙과 별도로 문자열 통째로 지운다.
  let prose = `${draft.title} ${draft.rationale}`;
  for (const id of [...facts.keys()].sort((a, b) => b.length - a.length)) {
    prose = prose.replaceAll(id, ' ');
  }
  const scan = scanNumbers(
    stripCitedIdentifiers(stripVerifiedQuotes(prose, citedTexts), citedTexts),
  );
  if (scan.derived) problems.push(`단위 변환·비율 표현은 쓸 수 없음: "${scan.derived}"`);
  if (scan.koreanNumeral) problems.push(`한글로 쓴 수는 검증할 수 없음: "${scan.koreanNumeral}"`);
  const ungrounded = [...new Set(scan.numbers.filter((n) => !allowed.has(n)))];
  if (ungrounded.length > 0) problems.push(`claims에 없는 숫자: ${ungrounded.join(', ')}`);

  // 2) 기획안 사양 칸(훅·산출물·성공 기준·브랜드 위험): "첫 2초", "1편", "1인분", "D+7" 같은 제작 사양은
  //    데이터 주장이 아니다. 사양 단위를 하나씩 허용하던 방식은 실제 Claude 출력("꿀팁 1가지", "1인분")에서
  //    계속 새는 곳이 생겨, "데이터처럼 보이는 숫자만 막는다"로 원칙을 바꿨다 (0002 §8).
  if (draft.plan) {
    const planText = [
      draft.plan.hook,
      draft.plan.deliverable,
      draft.plan.successCriteria,
      draft.plan.brandRisk ?? '',
    ].join(' ');
    problems.push(...specNumberProblems(planText, allowed, '기획 사양'));
  }

  const citedRuns = new Set(
    draft.evidence.filter((id) => id.startsWith('run:')).map((id) => Number(id.slice(4))),
  );
  const unknownRuns = scan.runReferences.filter((id) => !citedRuns.has(id));
  if (unknownRuns.length > 0)
    problems.push(`근거로 인용하지 않은 실행 번호: #${unknownRuns.join(', #')}`);

  return problems.length === 0
    ? {
        check: 'grounded_numbers',
        passed: true,
        detail: '문장 속 숫자가 검증된 claims 값이거나 제작 사양',
      }
    : { check: 'grounded_numbers', passed: false, detail: problems.join(' / ') };
}

/** 실행 대상이 근거와 맞는지. 제목은 "#recipe 수집"인데 실제 쿼리는 다른 키워드인 경우를 막는다. */
function checkTarget(draft: ProposalDraft, options: GuardOptions = {}): GuardCheck {
  const pass = (detail: string): GuardCheck => ({ check: 'target', passed: true, detail });
  const fail = (detail: string): GuardCheck => ({ check: 'target', passed: false, detail });

  if (draft.kind === 'collect_query') {
    if (!draft.queryValue) return fail('수집할 쿼리가 없습니다');
    const tag = asTag(draft.queryValue);
    const grounded = draft.evidence.some(
      (id) => id === `hashtag:${tag}` || (id.startsWith('related:') && id.endsWith(`>${tag}`)),
    );
    if (!grounded) {
      return fail(
        `실행할 쿼리 "${draft.queryValue}"가 근거(hashtag:${tag} 또는 related:*>${tag})에 없습니다`,
      );
    }
    if (!draft.title.toLowerCase().replace(/\s+/g, '').includes(tag)) {
      return fail(`제목에 실제 실행 대상 "${draft.queryValue}"가 드러나지 않습니다`);
    }
    return pass(`실행 대상 "${draft.queryValue}"가 근거와 제목에 일치`);
  }

  if (draft.kind === 'retry_run') {
    if (draft.runId === null) return fail('재실행할 실행 번호가 없습니다');
    return draft.evidence.includes(`run:${draft.runId}`)
      ? pass(`재실행 대상 #${draft.runId}이 근거에 있음`)
      : fail(`재실행 대상 run:${draft.runId}이 근거에 없습니다`);
  }
  if (draft.kind === 'content_brief') {
    if (!draft.plan) return fail('기획안에는 plan(포맷·훅·산출물·성공 기준)이 있어야 합니다');
    const required = options.requiredEvidence ?? [];
    if (required.length > 0 && !required.some((id) => draft.evidence.includes(id))) {
      return fail('마케터가 고른 레퍼런스를 근거로 인용하지 않았습니다');
    }
    return draft.evidence.includes(`format:${draft.plan.format}`)
      ? pass(`기획 포맷 "${draft.plan.format}"이 근거에 있음`)
      : fail(
          `기획 포맷 "${draft.plan.format}"의 근거(format:${draft.plan.format})를 인용하지 않았습니다`,
        );
  }
  return pass('실행 대상 없음 (운영 조치)');
}

function checkCapability(db: Db, draft: ProposalDraft): GuardCheck {
  const fail = (detail: string): GuardCheck => ({ check: 'capability', passed: false, detail });

  if (draft.kind === 'collect_query') {
    if (!draft.adapterId || !draft.queryKind || !draft.queryValue) {
      return fail('수집 제안에는 어댑터, 쿼리 종류, 쿼리 값이 모두 있어야 합니다');
    }
    const supported = AGENT_ADAPTERS[draft.adapterId];
    if (!supported) return fail(`에이전트가 실행할 수 없는 어댑터: ${draft.adapterId}`);
    const unavailable = collectUnavailableReason(draft.adapterId);
    if (unavailable) return fail(unavailable);
    if (!supported.includes(draft.queryKind)) {
      return fail(
        `${draft.adapterId}는 ${draft.queryKind} 검색을 지원하지 않습니다 (지원: ${supported.join(', ')})`,
      );
    }
    return {
      check: 'capability',
      passed: true,
      detail: `${draft.adapterId}로 ${draft.queryKind} 수집 가능`,
    };
  }

  if (draft.kind === 'retry_run') {
    if (draft.runId === null) return fail('재실행 제안에는 실행 번호가 있어야 합니다');
    const run = db
      .prepare(
        'SELECT adapter_id, query_kind, query_value, status FROM collection_run WHERE id = ?',
      )
      .get(draft.runId) as
      { adapter_id: string; query_kind: string; query_value: string; status: string } | undefined;
    if (!run) return fail(`실행 #${draft.runId}이 없습니다`);
    if (run.status !== 'partial' && run.status !== 'failed') {
      return fail(`실행 #${draft.runId}은 ${run.status} 상태라 재실행할 이유가 없습니다`);
    }
    const laterSuccess = db
      .prepare(
        `SELECT id FROM collection_run
          WHERE adapter_id = ? AND query_kind = ? AND query_value = ? AND id > ? AND status = 'succeeded'
          ORDER BY id LIMIT 1`,
      )
      .get(run.adapter_id, run.query_kind, run.query_value, draft.runId) as
      { id: number } | undefined;
    if (laterSuccess)
      return fail(`같은 쿼리가 이후 실행 #${laterSuccess.id}에서 이미 성공했습니다`);
    if (!AGENT_ADAPTERS[run.adapter_id])
      return fail(`${run.adapter_id} 실행은 에이전트가 재실행할 수 없습니다`);
    return {
      check: 'capability',
      passed: true,
      detail: `실행 #${draft.runId}(${run.status}) 재실행 가능`,
    };
  }

  if (draft.kind === 'content_brief') {
    return { check: 'capability', passed: true, detail: '실행 없이 마케터가 채택·거절하는 기획안' };
  }

  // operator_action은 실행하지 않고 사람에게 알리기만 한다
  return draft.adapterId || draft.queryValue
    ? fail('운영 조치 제안에는 실행 대상(어댑터·쿼리)을 넣지 않습니다')
    : { check: 'capability', passed: true, detail: '실행 없이 사람의 확인만 필요한 제안' };
}

function checkDuplicate(
  db: Db,
  draft: ProposalDraft,
  now: Date,
  options: GuardOptions,
): GuardCheck {
  const sameTarget = `kind = :kind
      AND COALESCE(adapter_id, '') = COALESCE(:adapterId, '')
      AND COALESCE(query_kind, '') = COALESCE(:queryKind, '')
      AND COALESCE(query_value, '') = COALESCE(:queryValue, '')
      AND COALESCE(run_id, -1) = COALESCE(:runId, -1)
      AND (kind <> 'operator_action' OR title = :title)
      AND id <> COALESCE(:excludeId, -1)`;
  const params = {
    kind: draft.kind,
    adapterId: draft.adapterId,
    queryKind: draft.queryKind,
    queryValue: draft.queryValue,
    runId: draft.runId,
    title: draft.title,
    excludeId: options.excludeProposalId ?? null,
  };

  // 운영 조치는 제목이 달라도 같은 실행을 근거로 들면 같은 조치로 본다 (실제 Claude가 표현만 바꿔 다시 낸 일이 있었다)
  if (draft.kind === 'operator_action') {
    const cited = draft.evidence.filter((id) => id.startsWith('run:') || id.startsWith('adapter:'));
    const overlap = db
      .prepare(
        `SELECT id, evidence FROM agent_proposal
          WHERE kind = 'operator_action' AND status = 'pending' AND id <> COALESCE(?, -1)`,
      )
      .all(options.excludeProposalId ?? null) as Array<{ id: number; evidence: string }>;
    const hit = overlap.find((row) =>
      (JSON.parse(row.evidence) as string[]).some((id) => cited.includes(id)),
    );
    if (hit) {
      return {
        check: 'duplicate',
        passed: false,
        detail: `같은 근거를 든 운영 조치 #${hit.id}이 이미 검토 중입니다`,
      };
    }
  }

  // 기획안의 정체는 포맷이다. 실행 대상 필드가 모두 비어 있어서 아래의 범용 검사로 보면 모든 기획안이
  // 서로 같은 대상이 된다 (실제 Claude 실행에서 다른 포맷 기획안이 중복으로 막힌 일이 있었다, 0002 §8).
  if (draft.kind === 'content_brief') {
    if (!draft.plan) return { check: 'duplicate', passed: true, detail: '해당 없음' };
    const sameFormat = db
      .prepare(
        `SELECT id FROM agent_proposal
          WHERE kind = 'content_brief' AND status = 'pending' AND json_extract(plan, '$.format') = ?
            AND id <> COALESCE(?, -1)`,
      )
      .get(draft.plan.format, options.excludeProposalId ?? null) as { id: number } | undefined;
    if (sameFormat) {
      return {
        check: 'duplicate',
        passed: false,
        detail: `같은 포맷의 기획안 #${sameFormat.id}이 이미 검토 중입니다`,
      };
    }
    const since = new Date(now.getTime() - REJECTION_MEMORY_DAYS * 86_400_000).toISOString();
    const rejected = db
      .prepare(
        `SELECT id, review_note FROM agent_proposal
          WHERE kind = 'content_brief' AND status = 'rejected' AND reviewed_at >= ?
            AND json_extract(plan, '$.format') = ?
          ORDER BY id DESC LIMIT 1`,
      )
      .get(since, draft.plan.format) as { id: number; review_note: string } | undefined;
    return rejected
      ? {
          check: 'duplicate',
          passed: false,
          detail: `마케터가 ${REJECTION_MEMORY_DAYS}일 안에 거절한 포맷입니다 (#${rejected.id}: ${rejected.review_note})`,
        }
      : {
          check: 'duplicate',
          passed: true,
          detail: '검토 중이거나 최근 거절된 같은 포맷 기획안 없음',
        };
  }

  const open = db
    .prepare(
      `SELECT id FROM agent_proposal WHERE status IN ('pending', 'approved') AND ${sameTarget}`,
    )
    .get(params) as { id: number } | undefined;
  if (open)
    return {
      check: 'duplicate',
      passed: false,
      detail: `같은 대상의 제안 #${open.id}이 이미 검토 중입니다`,
    };

  // 사람의 거절을 기억한다: 최근에 거절한 대상을 같은 내용으로 다시 올리지 못하게 한다
  const rejectedSince = new Date(now.getTime() - REJECTION_MEMORY_DAYS * 86_400_000).toISOString();
  const rejected = db
    .prepare(
      `SELECT id, review_note FROM agent_proposal
        WHERE status = 'rejected' AND reviewed_at >= :since AND ${sameTarget}
        ORDER BY id DESC LIMIT 1`,
    )
    .get({ ...params, since: rejectedSince }) as { id: number; review_note: string } | undefined;
  if (rejected) {
    return {
      check: 'duplicate',
      passed: false,
      detail: `최근 ${REJECTION_MEMORY_DAYS}일 안에 사람이 거절한 대상입니다 (#${rejected.id}: ${rejected.review_note})`,
    };
  }

  if (draft.kind === 'collect_query' && draft.adapterId && draft.queryValue) {
    const since = new Date(now.getTime() - RECENT_COLLECTION_HOURS * 3_600_000).toISOString();
    const recent = db
      .prepare(
        `SELECT id, query_value FROM collection_run
          WHERE adapter_id = ? AND query_kind = ? AND started_at >= ?
          ORDER BY id DESC`,
      )
      .all(draft.adapterId, draft.queryKind, since) as Array<{ id: number; query_value: string }>;
    // 저장된 쿼리도 같은 규칙으로 정규화해 비교한다
    const hit = recent.find(
      (run) =>
        draft.queryKind &&
        normalizeQueryValue(draft.queryKind, run.query_value) === draft.queryValue,
    );
    if (hit) {
      return {
        check: 'duplicate',
        passed: false,
        detail: `최근 ${RECENT_COLLECTION_HOURS}시간 안에 같은 쿼리를 수집했습니다 (실행 #${hit.id})`,
      };
    }
  }
  return {
    check: 'duplicate',
    passed: true,
    detail: '검토 중이거나 거절된 같은 제안, 최근 수집 없음',
  };
}

function checkQuota(db: Db, draft: ProposalDraft, now: Date): GuardCheck {
  if (
    draft.kind === 'collect_query' &&
    (draft.adapterId === 'search-tiktok' || draft.adapterId === 'search-instagram')
  ) {
    const used = webSearchesToday(db, now);
    return used < SEARCH_DAILY_LIMIT
      ? {
          check: 'quota',
          passed: true,
          detail: `검색 API 오늘 ${used}/${SEARCH_DAILY_LIMIT}회 (UTC 기준)`,
        }
      : {
          check: 'quota',
          passed: false,
          detail: `검색 API 오늘 한도 도달 (${used}/${SEARCH_DAILY_LIMIT}회)`,
        };
  }
  if (draft.kind === 'collect_query' && draft.adapterId === 'youtube-data') {
    const used = youtubeSearchesToday(db, now);
    return used < YOUTUBE_DAILY_SEARCH_LIMIT
      ? {
          check: 'quota',
          passed: true,
          detail: `YouTube 검색 오늘 ${used}/${YOUTUBE_DAILY_SEARCH_LIMIT}회 (태평양 시간 기준)`,
        }
      : {
          check: 'quota',
          passed: false,
          detail: `YouTube 오늘 검색 한도 도달 (${used}/${YOUTUBE_DAILY_SEARCH_LIMIT}회)`,
        };
  }
  if (
    draft.kind !== 'collect_query' ||
    draft.adapterId !== 'instagram-graph' ||
    !draft.queryValue
  ) {
    return { check: 'quota', passed: true, detail: '해당 없음' };
  }
  const used = new Set(
    instagramHashtagsUsed(db, now).map((tag) => normalizeQueryValue('hashtag', tag)),
  );
  const after = used.has(draft.queryValue) ? used.size : used.size + 1;
  return after <= INSTAGRAM_HASHTAG_LIMIT
    ? {
        check: 'quota',
        passed: true,
        detail: `Instagram 해시태그 ${after}/${INSTAGRAM_HASHTAG_LIMIT} (7일)`,
      }
    : {
        check: 'quota',
        passed: false,
        detail: `Instagram 7일 해시태그 한도 초과 (${after}/${INSTAGRAM_HASHTAG_LIMIT})`,
      };
}
