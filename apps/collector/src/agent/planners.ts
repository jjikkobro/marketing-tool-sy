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
const plannerOutputSchema = z.object({
  proposals: z.array(
    z.object({
      kind: z.enum(['collect_query', 'retry_run', 'operator_action']),
      title: z.string(),
      rationale: z.string(),
      adapterId: z.string().nullable(),
      queryKind: z.enum(['keyword', 'hashtag']).nullable(),
      queryValue: z.string().nullable(),
      runId: z.number().int().nullable(),
      evidence: z.array(z.string()),
      claims: z.array(z.object({ factId: z.string(), field: z.string(), value: z.number() })),
    }),
  ),
});

const SYSTEM_PROMPT = `당신은 소셜 콘텐츠 수집 운영 에이전트의 계획 담당이다.
주어진 관찰 사실(facts)만 보고, 다음에 할 일을 최대 5개 제안한다.

제안 종류
- collect_query: 새로 수집할 키워드나 해시태그. 관련 해시태그(related:*) 중 아직 직접 수집하지 않은 것을 우선한다.
- retry_run: 부분 실패(partial)나 실패(failed)한 실행을 다시 돌리기. 일시적 오류(429, 5xx)였을 때만 의미가 있다.
- operator_action: 사람이 직접 해야 하는 조치 (예: 토큰 만료 → 토큰 갱신). 실행 대상 필드는 모두 null로 둔다.

사용할 수 있는 어댑터와 검색 종류: ${JSON.stringify(AGENT_ADAPTERS)}

반드시 지킬 것
- evidence에는 facts에 있는 factId만 넣는다. 없는 사실을 만들지 않는다.
- 숫자를 말하려면 claims에 {factId, field, value}로 적고, value는 그 사실의 values에 있는 값을 그대로 옮긴다.
- title과 rationale에 숫자를 쓸 때는 evidence에 인용한 사실의 값만 쓴다. 해당 값이 없으면 숫자를 쓰지 말고 말로 설명한다.
- 비율, 증감률, 순위처럼 facts에 없는 값을 계산해서 쓰지 않는다.
- 확실한 근거가 없으면 제안하지 않는다. 제안이 없으면 빈 배열을 돌려준다.
- 한국어로 쓴다.`;

export function claudePlanner(options: { client?: Anthropic; model?: string } = {}): Planner {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? 'claude-opus-5-5';

  return {
    id: `claude:${model}`,
    async propose(observation: Observation): Promise<unknown[]> {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리한다 (기본 라우팅)
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high', format: betaZodOutputFormat(plannerOutputSchema) },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `관찰 시각: ${observation.generatedAt}\n\nfacts:\n${JSON.stringify(observation.facts)}`,
          },
        ],
      });
      if (response.stop_reason === 'refusal') {
        throw new Error(
          `계획 요청이 거절되었습니다 (${response.stop_details?.category ?? '분류 없음'})`,
        );
      }
      if (!response.parsed_output) throw new Error('계획 응답을 해석하지 못했습니다');
      return response.parsed_output.proposals;
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
    evidence: ['run:5', 'adapter:instagram-graph'],
    claims: [{ factId: 'adapter:instagram-graph', field: 'errors_auth', value: 1 }],
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
