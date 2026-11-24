/**
 * MCP 서버 (stdio). 수집한 데이터를 AI 에이전트가 직접 조회할 수 있게 도구로 공개한다.
 *
 * 모든 도구는 읽기 전용이다. AI가 수집을 실행하거나 데이터를 지울 수는 없다.
 * 도구 본체는 CLI·웹 export와 같은 queries/ 함수라서, AI가 보는 숫자와 사람이 보는 화면의 숫자가 같다.
 *
 * Claude Code 연결:
 *   claude mcp add social-collector -- npx tsx apps/collector/src/mcp.ts
 *   (DB 경로를 바꾸려면 COLLECTOR_DB 환경변수)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
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

await server.connect(new StdioServerTransport());
