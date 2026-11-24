/**
 * MCP 서버 (stdio). 수집한 데이터를 AI 에이전트가 직접 조회할 수 있게 도구로 공개한다.
 *
 * 조회 도구와 제안 도구만 공개한다. AI는 제안(propose_action)까지만 할 수 있고,
 * 제안은 가드를 거쳐 사람의 검토 대기열에 들어간다. 승인·실행·삭제 도구는 없다.
 * 도구 본체는 CLI·웹 export와 같은 queries/ 함수라서, AI가 보는 숫자와 사람이 보는 화면의 숫자가 같다.
 *
 * Claude Code 연결:
 *   claude mcp add social-collector -- npx tsx apps/collector/src/mcp.ts
 *   (DB 경로를 바꾸려면 COLLECTOR_DB 환경변수)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { buildObservation } from './agent/observation.ts';
import { submitProposal } from './agent/review.ts';
import { listProposals } from './agent/store.ts';
import { openDatabase } from './db/database.ts';
import { toolDefinitions } from './mcp-tools.ts';
import {
  adapterHealth,
  listErrors,
  listRuns,
  relatedHashtags,
  searchContents,
  topHashtags,
} from './queries/index.ts';

const dbPath = process.env.COLLECTOR_DB ?? resolve(import.meta.dirname, '../.data/collector.db');
const db = openDatabase(dbPath);

const server = new McpServer({ name: 'social-collector', version: '0.1.0' });

/** 결과를 JSON 텍스트로 돌려준다. 값이 없는 지표는 null로 남겨 AI가 0으로 오해하지 않게 한다. */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

server.registerTool('search_contents', toolDefinitions.search_contents, async (params) =>
  json(searchContents(db, params)),
);

server.registerTool('related_hashtags', toolDefinitions.related_hashtags, async ({ seed, limit }) =>
  json(relatedHashtags(db, seed, { limit })),
);

server.registerTool('top_hashtags', toolDefinitions.top_hashtags, async ({ limit }) =>
  json(topHashtags(db, { limit })),
);

server.registerTool('collection_health', toolDefinitions.collection_health, async () =>
  json(adapterHealth(db)),
);

server.registerTool('list_runs', toolDefinitions.list_runs, async ({ limit, includeErrors }) =>
  json(
    listRuns(db, { limit }).map((run) => ({
      ...run,
      ...(includeErrors && { errors: listErrors(db, { runId: run.id }) }),
    })),
  ),
);

server.registerTool('observe', toolDefinitions.observe, async () => json(buildObservation(db)));

server.registerTool('propose_action', toolDefinitions.propose_action, async (draft) => {
  const { proposal, checks } = submitProposal(db, draft, 'mcp-client');
  return json({
    status: proposal?.status ?? 'blocked',
    proposalId: proposal?.id ?? null,
    message:
      proposal?.status === 'pending'
        ? '가드를 통과해 사람의 검토 대기열에 들어갔습니다. 승인 전에는 실행되지 않습니다.'
        : '가드를 통과하지 못했습니다. 실패한 검사를 보고 근거를 고쳐 다시 제안하세요.',
    checks,
  });
});

server.registerTool('list_proposals', toolDefinitions.list_proposals, async ({ status, limit }) =>
  json(listProposals(db, { status, limit })),
);

await server.connect(new StdioServerTransport());
