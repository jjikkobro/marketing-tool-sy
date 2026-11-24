/**
 * MCP 도구 정의 (이름, 설명, 입력 스키마).
 * 조회 도구와 제안 도구만 있다. 승인·실행 도구는 일부러 두지 않는다 (사람의 확인을 거치게 하기 위해서).
 * mcp.ts가 이 정의로 도구를 등록하고, 웹의 "AI 에이전트 연결" 화면도 이 정의를 그대로 보여준다.
 * 그래서 문서와 실제 서버가 어긋나지 않는다. 이 파일은 DB나 Node API를 import하지 않는다.
 */
import { z } from 'zod';
import { platformSchema, proposalDraftSchema, proposalStatusSchema } from './schema.ts';

export const toolDefinitions = {
  search_contents: {
    title: '수집 콘텐츠 검색',
    description:
      '수집한 TikTok·Instagram·웹 콘텐츠를 캡션 텍스트, 해시태그, 플랫폼, 최소 조회수로 검색한다. ' +
      '조회수 내림차순이며 조회수를 모르는(null) 콘텐츠는 뒤로 간다. metrics의 null은 "수집 못 함"이지 0이 아니다.',
    inputSchema: {
      text: z.string().optional().describe('캡션에 포함된 문자열'),
      hashtag: z.string().optional().describe('# 없이, 예: spicynoodlechallenge'),
      platform: platformSchema.optional(),
      minViews: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  related_hashtags: {
    title: '관련 해시태그 (탐색 범위 넓히기)',
    description:
      '시드 해시태그와 같은 게시물에 함께 쓰인 해시태그를 빈도순으로 돌려준다. 다음 수집 키워드 후보를 찾을 때 쓴다.',
    inputSchema: {
      seed: z.string().describe('시드 해시태그, 예: spicynoodlechallenge'),
      limit: z.number().int().min(1).max(50).default(10),
    },
  },
  top_hashtags: {
    title: '해시태그 상위 목록',
    description: '수집한 전체 콘텐츠에서 많이 쓰인 해시태그와 조회수 합계를 돌려준다.',
    inputSchema: { limit: z.number().int().min(1).max(50).default(15) },
  },
  collection_health: {
    title: '수집 상태 점검',
    description:
      '어댑터별 실행 횟수, 성공·부분 실패·실패 건수, 오류 종류별 건수를 돌려준다. ' +
      '데이터를 해석하기 전에 수집이 정상이었는지 먼저 확인할 때 쓴다.',
    inputSchema: {},
  },
  list_runs: {
    title: '최근 수집 실행',
    description: '최근 수집 실행 기록과 실행별 오류·경고를 돌려준다.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(10),
      includeErrors: z.boolean().default(true),
    },
  },
  observe: {
    title: '관찰 사실 조회 (제안 전 필수)',
    description:
      '에이전트가 근거로 인용할 수 있는 사실 목록(factId와 SQL로 계산한 값)을 돌려준다. ' +
      'propose_action의 evidence와 claims에는 여기 있는 factId와 값만 쓸 수 있다.',
    inputSchema: {},
  },
  propose_action: {
    title: '다음 행동 제안 (승인은 사람만)',
    description:
      '수집·재실행·운영 조치를 제안한다. 제안은 즉시 실행되지 않는다. ' +
      '가드가 근거·수치·문장 속 숫자·실행 가능성·중복·쿼터를 검사하고, 통과하면 사람의 검토 대기열에 들어간다. ' +
      '실패하면 blocked로 기록되고 실패한 검사와 이유를 돌려준다. 이 서버에는 승인 도구가 없다.',
    inputSchema: proposalDraftSchema.shape,
  },
  list_proposals: {
    title: '제안과 검토 결과 조회',
    description:
      '제안의 상태(blocked, pending, executed, rejected 등), 가드 검사 결과, 사람의 결정과 사유를 돌려준다.',
    inputSchema: {
      status: proposalStatusSchema.optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
} as const;

export type ToolName = keyof typeof toolDefinitions;

export const toolNames: ToolName[] = Object.keys(toolDefinitions).filter(
  (key): key is ToolName => key in toolDefinitions,
);

/** 화면에 보여줄 입력 파라미터 요약 (이름과 설명). */
export function describeInputs(
  name: ToolName,
): Array<{ name: string; description: string | undefined }> {
  return Object.entries(toolDefinitions[name].inputSchema).map(([key, schema]) => ({
    name: key,
    description: schema.description,
  }));
}
