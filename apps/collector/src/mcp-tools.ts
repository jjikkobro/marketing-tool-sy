/**
 * MCP 도구 정의 (이름, 설명, 입력 스키마).
 * mcp.ts가 이 정의로 도구를 등록하고, 웹의 "AI 에이전트 연결" 화면도 이 정의를 그대로 보여준다.
 * 그래서 문서와 실제 서버가 어긋나지 않는다. 이 파일은 DB나 Node API를 import하지 않는다.
 */
import { z } from 'zod';
import { platformSchema } from './schema.ts';

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
