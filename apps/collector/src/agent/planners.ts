/**
 * 계획자(planner): 관찰 사실을 보고 다음 행동을 제안한다.
 *
 * - claudePlanner: Claude API(구조화 출력)로 제안을 만든다. ANTHROPIC_API_KEY 등 인증이 있을 때만 쓴다.
 * - recordedPlanner: 키 없이 데모를 돌리기 위한 녹화 응답. 가드가 실제로 막는지 보여주려고
 *   일부러 틀린 제안(없는 근거, 부풀린 수치, 지원하지 않는 검색, 중복)을 섞어 두었다.
 *
 * 어느 쪽이든 출력은 "초안"일 뿐이다. 실행 여부는 가드와 사람이 정한다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { ProposalDraft } from '../schema.ts';
import { AGENT_ADAPTERS } from './guard.ts';
import type { Observation } from './observation.ts';

export interface Planner {
  /** 제안 기록의 proposed_by에 남는 이름 */
  readonly id: string;
  propose(observation: Observation): Promise<unknown[]>;
}

/*
 * 구조화 출력 스키마. min/max 같은 제약은 JSON Schema 변환에서 빠질 수 있어 여기서는 형태만 강제하고,
 * 길이·내용 검증은 가드(proposalDraftSchema)가 다시 한다. LLM 출력은 처음부터 끝까지 "검증 전 입력"으로 다룬다.
 */
const claimSchema = z.object({ factId: z.string(), field: z.string(), value: z.number() });

/*
 * 기획안과 실행 제안을 출력 칸부터 나눈다. 한 배열에 kind로 섞어 받았을 때, 실제 Claude가 기획안에
 * kind="collect_query"를 붙여 마케터에게 가야 할 기획안이 차단된 일이 있었다 (docs/decisions/0002 §8).
 * 칸을 나누면 종류를 잘못 고를 여지 자체가 없다.
 */
const plannerOutputSchema = z.object({
  contentBriefs: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      plan: z.object({
        format: z.string(),
        hook: z.string(),
        deliverable: z.string(),
        successCriteria: z.string(),
        brandRisk: z.string().nullable(),
      }),
      evidence: z.array(z.string()),
      claims: z.array(claimSchema),
    }),
  ),
  actions: z.array(
    z.object({
      kind: z.enum(['collect_query', 'retry_run', 'operator_action']),
      title: z.string(),
      rationale: z.string(),
      adapterId: z.string().nullable(),
      queryKind: z.enum(['keyword', 'hashtag']).nullable(),
      queryValue: z.string().nullable(),
      runId: z.number().int().nullable(),
      evidence: z.array(z.string()),
      claims: z.array(claimSchema),
    }),
  ),
});

const SYSTEM_PROMPT = `당신은 소셜 콘텐츠 수집 운영 에이전트의 계획 담당이다.
주어진 관찰 사실(facts), 사람의 최근 결정(recentDecisions), 이미 검토 대기 중인 제안(openProposals)을 보고 두 가지를 낸다.
- contentBriefs: 마케터에게 올리는 콘텐츠 기획안 1~2개. format:* 사실이 하나라도 있으면 반드시 1개 이상 낸다.
- actions: 수집 운영 제안 최대 3개 (collect_query, retry_run, operator_action).
당신의 제안은 결정적 검증기를 거친 뒤 사람이 승인해야 실행된다.

actions의 종류
- collect_query: 새로 수집할 키워드나 해시태그. 관련 해시태그(related:*) 중 아직 직접 수집하지 않은 것을 우선한다.
- retry_run: 부분 실패(partial)나 실패(failed)한 실행을 다시 돌리기. 일시적 오류(429, 5xx)였을 때만 의미가 있다.
- operator_action: 사람이 직접 해야 하는 조치 (예: 토큰 만료 → 토큰 갱신). 실행 대상 필드는 모두 null로 둔다.
- contentBriefs 항목: 수집 데이터에서 반응이 큰 포맷(format:*)을 골라
  plan = { format: 근거로 인용한 format:* 의 이름, hook: 영상 첫 부분의 훅, deliverable: 만들 산출물, successCriteria: 채택 후 D+7에 무엇을 보고 성공으로 판단할지, brandRisk: 브랜드 위험(없으면 null) }.
  format:<이름>을 evidence에 반드시 넣는다.
  YouTube 영상(video:youtube:*)은 영상 단위 참고 사례로만 인용하고, 여러 영상의 값을 합치거나 비교 지표를 만들지 않는다.
  "바이럴을 예측한다" 같은 단정은 하지 않는다. 데이터가 보여주는 사실과 기획 가설을 구분해 쓴다.

사용할 수 있는 어댑터와 검색 종류: ${JSON.stringify(AGENT_ADAPTERS)}

반드시 지킬 것 (어기면 검증기가 제안을 차단한다)
- evidence에는 facts에 있는 factId만 넣는다. 없는 사실을 만들지 않는다.
- collect_query는 실행할 쿼리 자체가 근거에 있어야 한다: hashtag:<쿼리> 또는 related:<시드>><쿼리>를 evidence에 넣는다. 제목에 그 쿼리를 그대로 쓴다.
- retry_run은 run:<번호>를 evidence에 넣는다.
- 숫자를 쓰려면 claims에 {factId, field, value}로 적고 value는 그 사실의 값을 그대로 옮긴다.
- title과 rationale에는 claims에 적은 값만 숫자로 쓴다. 만·배·%·비율·증감률처럼 바꾸거나 계산한 값, 한글로 쓴 수("세 배", "삼백만")는 쓰지 않는다.
- recentDecisions에서 사람이 거절했거나 검증기가 차단한 제안과 같은 대상은 다시 제안하지 않는다. 거절 사유를 읽고 반영한다.
- openProposals에 이미 있는 대상(같은 쿼리, 같은 실행, 같은 포맷, 같은 운영 조치)은 다시 제안하지 않는다.
- 확실한 근거가 없으면 제안하지 않는다. 제안이 없으면 빈 배열을 돌려준다.
- 한국어로 쓴다.`;

export function claudePlanner(
  options: { client?: Anthropic; model?: string; effort?: 'low' | 'medium' | 'high' } = {},
): Planner {
  // 라이브 데모에서 심사자가 기다리는 시간을 줄이려고 요청 시간 상한을 둔다
  const client = options.client ?? new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const model = options.model ?? 'claude-opus-5-5';
  const effort = options.effort ?? 'high';

  return {
    id: `claude:${model}`,
    async propose(observation: Observation): Promise<unknown[]> {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리한다 (기본 라우팅)
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort, format: betaZodOutputFormat(plannerOutputSchema) },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `관찰 시각: ${observation.generatedAt}\n\nfacts:\n${JSON.stringify(observation.facts)}\n\nrecentDecisions:\n${JSON.stringify(observation.recentDecisions)}\n\nopenProposals:\n${JSON.stringify(observation.openProposals)}`,
          },
        ],
      });
      if (response.stop_reason === 'refusal') {
        throw new Error(
          `계획 요청이 거절되었습니다 (${response.stop_details?.category ?? '분류 없음'})`,
        );
      }
      if (!response.parsed_output) throw new Error('계획 응답을 해석하지 못했습니다');
      const { contentBriefs, actions } = response.parsed_output;
      return [
        ...contentBriefs.map((brief) => ({
          kind: 'content_brief' as const,
          ...brief,
          adapterId: null,
          queryKind: null,
          queryValue: null,
          runId: null,
        })),
        ...actions.map((action) => ({ ...action, plan: null })),
      ];
    },
  };
}

/**
 * 녹화된 계획 응답 (데모용). `full` 시나리오 데이터를 보고 만든 응답이다.
 * 앞의 3개는 근거가 맞는 제안이고, 뒤의 3개는 가드가 막아야 하는 대표적인 할루시네이션이다.
 */
export const RECORDED_PROPOSALS: ProposalDraft[] = [
  {
    kind: 'collect_query',
    title: '#asmr 해시태그를 TikTok에서 직접 수집',
    rationale:
      '#mukbang 콘텐츠 중 12건에 #asmr이 함께 쓰였습니다. 아직 #asmr 자체로는 수집하지 않아 탐색 범위를 넓힐 수 있습니다.',
    adapterId: 'tiktok-research',
    queryKind: 'hashtag',
    queryValue: 'asmr',
    runId: null,
    plan: null,
    evidence: ['related:mukbang>asmr', 'hashtag:asmr'],
    claims: [
      { factId: 'related:mukbang>asmr', field: 'contents', value: 12 },
      { factId: 'hashtag:asmr', field: 'contents', value: 12 },
    ],
  },
  {
    kind: 'retry_run',
    title: '부분 실패한 실행 #4 다시 수집',
    rationale:
      '실행 #4는 서버 오류(503)가 이어져 2페이지까지만 받았습니다. 일시적 오류이므로 다시 시도할 만합니다.',
    adapterId: null,
    queryKind: null,
    queryValue: null,
    runId: 4,
    plan: null,
    evidence: ['run:4'],
    claims: [
      { factId: 'run:4', field: 'lastHttpStatus', value: 503 },
      { factId: 'run:4', field: 'pagesFetched', value: 2 },
    ],
  },
  {
    kind: 'operator_action',
    title: 'Instagram 액세스 토큰 갱신 필요',
    rationale:
      '실행 #5가 토큰 만료로 실패했습니다. 토큰을 갱신하기 전까지 Instagram 수집 제안은 모두 같은 이유로 실패합니다.',
    adapterId: null,
    queryKind: null,
    queryValue: null,
    runId: null,
    plan: null,
    evidence: ['run:5', 'adapter:instagram-graph'],
    claims: [{ factId: 'adapter:instagram-graph', field: 'errors_auth', value: 1 }],
  },
  {
    kind: 'content_brief',
    title: '챌린지 포맷: 맵기 단계별 리액션 숏폼 기획',
    rationale:
      '수집한 콘텐츠에서 챌린지 포맷이 가장 많이 반복됩니다. 같은 구조(단계별 도전 → 표정 리액션)를 브랜드 제품에 맞춰 시험해 볼 만합니다. 효과는 가설이며 채택 후 성과로 확인합니다.',
    adapterId: null,
    queryKind: null,
    queryValue: null,
    runId: null,
    plan: {
      format: 'challenge',
      hook: '첫 장면에서 맵기 단계를 자막으로 먼저 보여주고, 다음 단계로 넘어갈지 묻는다',
      deliverable: '15초 세로 숏폼 1편 + 영어 캡션 1안',
      successCriteria: 'D+7 시점 조회와 저장이 같은 계정의 최근 숏폼 평균보다 높은지 확인',
      brandRisk: '과도한 섭취·고통 연출은 피하고 안전 문구를 넣는다',
    },
    evidence: ['format:challenge', 'hashtag:spicynoodlechallenge'],
    claims: [],
  },
  // ── 아래는 가드가 막아야 하는 제안 ──
  {
    kind: 'collect_query',
    title: '#spicyramen 급상승, Instagram에서 수집',
    rationale: '#spicyramen의 조회 합계가 3,200,000으로 지난주보다 240% 늘었습니다.',
    adapterId: 'instagram-graph',
    queryKind: 'hashtag',
    queryValue: 'spicyramen',
    runId: null,
    plan: null,
    evidence: ['hashtag:spicyramen'],
    claims: [{ factId: 'hashtag:spicyramen', field: 'totalViews', value: 3_200_000 }],
  },
  {
    kind: 'collect_query',
    title: 'Instagram에서 "fire noodle" 키워드 검색',
    rationale:
      '#spicynoodlechallenge 콘텐츠가 120건으로 가장 많으니 연관 키워드도 Instagram에서 찾아봅니다.',
    adapterId: 'instagram-graph',
    queryKind: 'keyword',
    queryValue: 'fire noodle',
    runId: null,
    plan: null,
    evidence: ['hashtag:spicynoodlechallenge'],
    claims: [{ factId: 'hashtag:spicynoodlechallenge', field: 'contents', value: 120 }],
  },
  {
    kind: 'collect_query',
    title: '"spicy noodle challenge" 다시 수집',
    rationale: '가장 많이 수집된 주제이므로 한 번 더 수집합니다.',
    adapterId: 'tiktok-research',
    queryKind: 'keyword',
    queryValue: 'spicy noodle challenge',
    runId: null,
    plan: null,
    evidence: ['hashtag:spicynoodlechallenge'],
    claims: [],
  },
];

export function recordedPlanner(): Planner {
  return {
    id: 'recorded:claude-opus-5-5',
    propose: async () => RECORDED_PROPOSALS,
  };
}
