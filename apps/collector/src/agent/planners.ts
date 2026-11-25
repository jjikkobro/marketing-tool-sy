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
import { collectUnavailableReason } from './availability.ts';
import { AGENT_ADAPTERS } from './guard.ts';
import type { Observation } from './observation.ts';
import { DEFAULT_GUIDELINES, PLANNER_RULES, withGuidelines } from './prompts.ts';

/** 지금 환경에서 실제로 실행할 수 있는 어댑터만 계획자에게 알려준다 (막힐 제안을 애초에 줄인다) */
function availableAdapters() {
  return Object.fromEntries(
    Object.entries(AGENT_ADAPTERS).filter(([id]) => collectUnavailableReason(id) === null),
  );
}

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

/**
 * 레퍼런스 기반 기획 요청. 지시는 시스템 프롬프트가 아니라 user 메시지에 넣는다 (고정 규칙은 그대로 둔다).
 */
function focusInstruction(observation: Observation): string {
  const focus = observation.focusReferences ?? [];
  if (focus.length === 0) return '';
  return `

마케터가 레퍼런스를 골라 기획을 요청했다: ${JSON.stringify(focus)}
- 이번에는 contentBriefs만 1~2개 내고 actions는 빈 배열로 둔다.
- 각 기획안의 evidence에 고른 레퍼런스 중 하나 이상과, 그 레퍼런스의 포맷에 맞는 format:* 사실을 넣는다.
- rationale에는 고른 레퍼런스에서 무엇을 가져왔는지(구성, 훅, 연출)를 쓴다. 레퍼런스를 그대로 베끼는 기획은 하지 않는다.`;
}

export function claudePlanner(
  options: {
    client?: Anthropic;
    model?: string;
    effort?: 'low' | 'medium' | 'high';
    /** Admin에서 고친 기획 지침. 없으면 기본 지침 */
    guidelines?: string;
  } = {},
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
        system: withGuidelines(
          PLANNER_RULES,
          options.guidelines ?? DEFAULT_GUIDELINES.brief_guidelines,
        ),
        messages: [
          {
            role: 'user',
            content: `관찰 시각: ${observation.generatedAt}${focusInstruction(observation)}\n\nadapters:\n${JSON.stringify(availableAdapters())}\n\nfacts:\n${JSON.stringify(observation.facts)}\n\nrecentDecisions:\n${JSON.stringify(observation.recentDecisions)}\n\nopenProposals:\n${JSON.stringify(observation.openProposals)}`,
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
