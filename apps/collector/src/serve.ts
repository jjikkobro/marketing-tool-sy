/**
 * 로컬 검토 API (node:http). 웹 화면에서 사람이 제안을 승인·거절할 때 쓴다.
 *
 * - 127.0.0.1에만 열어 같은 컴퓨터에서만 접근할 수 있다. 인증이 없는 대신 외부에 노출하지 않는다.
 * - 정적 배포된 웹에는 이 API가 없으므로 화면은 읽기 전용으로 동작한다 (apps/web/src/api/snapshot.ts).
 * - 처음에는 HTTP 서버를 두지 않기로 했지만, 사람의 승인 단계를 화면에 넣으면서 결정을 바꿨다 (docs/decisions/0003).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { z } from 'zod';
import { adapterFactoryFromEnv } from './agent/adapters-from-env.ts';
import { acknowledge, approve, reject, ReviewError } from './agent/review.ts';
import { openDatabase } from './db/database.ts';
import { buildSnapshot } from './snapshot.ts';

const PORT = Number(process.env.COLLECTOR_PORT ?? 8787);
const HOST = '127.0.0.1';
const db = openDatabase(
  process.env.COLLECTOR_DB ?? resolve(import.meta.dirname, '../.data/collector.db'),
);

const decisionSchema = z.object({
  reviewer: z
    .string({ error: '검토자 이름이 필요합니다' })
    .trim()
    .min(1, '검토자 이름이 필요합니다')
    .max(60),
  note: z.string({ error: '사유는 문자열이어야 합니다' }).trim().max(500).optional(),
});

const ROUTE = /^\/api\/proposals\/(\d+)\/(approve|reject|ack)$/;
const MAX_BODY_BYTES = 10_000;

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new ReviewError('요청 본문이 너무 큽니다');
    chunks.push(buffer);
  }
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/snapshot') {
      const mode = adapterFactoryFromEnv().mode;
      return send(response, 200, buildSnapshot(db, { scenario: 'local', dataMode: mode }));
    }

    const match = request.method === 'POST' ? ROUTE.exec(request.url ?? '') : null;
    if (!match) return send(response, 404, { error: '없는 경로입니다' });

    const id = Number(match[1]);
    const action = match[2];
    const parsed = decisionSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return send(response, 400, { error: parsed.error.issues[0]?.message ?? '잘못된 요청' });
    const { reviewer, note } = parsed.data;

    if (action === 'approve') {
      const { adapterFor } = adapterFactoryFromEnv();
      return send(response, 200, await approve(db, id, { reviewer, note, adapterFor }));
    }
    if (action === 'reject')
      return send(response, 200, reject(db, id, { reviewer, note: note ?? '' }));
    return send(response, 200, acknowledge(db, id, { reviewer, note }));
  } catch (error) {
    if (error instanceof ReviewError) return send(response, 409, { error: error.message });
    if (error instanceof SyntaxError) return send(response, 400, { error: 'JSON 형식이 아닙니다' });
    console.error(error);
    return send(response, 500, { error: '서버 오류' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`검토 API: http://${HOST}:${PORT} (실행 모드: ${adapterFactoryFromEnv().mode})`);
});
