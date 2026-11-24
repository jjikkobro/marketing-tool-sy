/**
 * 라이브 데모 서버: 웹 화면 + API를 한 주소에서 제공한다.
 *
 * - 방문자마다 데모 DB의 사본(샌드박스)을 준다. 각자 AI 제안을 받고 승인·실행해 볼 수 있다.
 * - AI 계획(Claude)은 실제로 호출한다. 비용과 남용은 ClaudeBudget으로 묶고, 한도를 넘으면 녹화 응답으로 대체한 이유를 보여준다.
 * - 수집: YouTube는 YOUTUBE_API_KEY가 있으면 실제 API로 수집한다. TikTok·Instagram은 실제 API 권한이 없어
 *   공식 응답 형식의 녹화본을 쓴다. 플랫폼별 상태를 화면에 그대로 표시한다.
 * - 쓰기 요청은 Host·Origin·Content-Type·세션 토큰을 검사한다 (review-security.ts).
 *
 * 실행: npm run live (로컬) · 배포: Dockerfile / render.yaml
 */
import '../env.ts';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { z } from 'zod';
import { adapterFactoryFromEnv } from '../agent/adapters-from-env.ts';
import { claudePlanner, recordedPlanner, type Planner } from '../agent/planners.ts';
import { acknowledge, approve, planAndGuard, reject, ReviewError } from '../agent/review.ts';
import { rejectCrossSite } from '../review-security.ts';
import type { LiveStatus, PlanResponse } from '../schema.ts';
import { buildSnapshot } from '../snapshot.ts';
import { ClaudeBudget } from './budget.ts';
import { buildSeed } from './seed.ts';
import { SessionStore, type Session } from './sessions.ts';

const env = process.env;
const PORT = Number(env.PORT ?? env.COLLECTOR_PORT ?? 8787);
const HOST = env.HOST ?? '127.0.0.1';
const PUBLIC_HOSTS = (env.PUBLIC_HOSTS ?? env.RENDER_EXTERNAL_HOSTNAME ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
const STATIC_DIR = resolve(env.STATIC_DIR ?? resolve(import.meta.dirname, '../../../web/dist'));
const CLAUDE_MODEL = env.CLAUDE_MODEL ?? 'claude-opus-5-5';
/** 라이브 데모는 응답 대기 시간을 줄이려고 medium을 기본으로 한다 (Opus 5.5의 기본값과 같다) */
const CLAUDE_EFFORT = z.enum(['low', 'medium', 'high']).catch('medium').parse(env.CLAUDE_EFFORT);
const CLAUDE_ENABLED = Boolean(env.ANTHROPIC_API_KEY);
const COOKIE = 'sc_sid';

const budget = new ClaudeBudget({
  dailyLimit: Number(env.CLAUDE_DAILY_LIMIT ?? 100),
  perSessionLimit: Number(env.CLAUDE_PER_SESSION_LIMIT ?? 3),
  maxConcurrent: Number(env.CLAUDE_MAX_CONCURRENT ?? 2),
});

const decisionSchema = z.object({
  reviewer: z
    .string({ error: '검토자 이름이 필요합니다' })
    .trim()
    .min(1, '검토자 이름이 필요합니다')
    .max(60),
  note: z.string({ error: '사유는 문자열이어야 합니다' }).trim().max(500).optional(),
});

const DECISION_ROUTE = /^\/api\/proposals\/(\d+)\/(approve|reject|ack)$/;
const MAX_BODY_BYTES = 10_000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

console.log('시드 DB를 만드는 중…');
const { seed, browserSeeded, youtubeSeeded } = await buildSeed();
if (youtubeSeeded > 0)
  console.log(`YouTube 실제 데이터 ${youtubeSeeded}건으로 시드를 만들었습니다`);
const sessions = new SessionStore(seed, {
  maxSessions: Number(env.MAX_SESSIONS ?? 200),
  ttlMs: 60 * 60_000,
});

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function cookieOf(request: IncomingMessage, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function sessionFor(request: IncomingMessage, response: ServerResponse): Session {
  const { session, created } = sessions.resolve(cookieOf(request, COOKIE));
  if (created) {
    const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    response.setHeader(
      'set-cookie',
      `${COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${secure}`,
    );
  }
  return session;
}

function liveStatus(session: Session): LiveStatus {
  const { remainingToday, remainingForSession } = budget.status(session.plansUsed);
  return {
    claude: {
      enabled: CLAUDE_ENABLED,
      model: CLAUDE_ENABLED ? CLAUDE_MODEL : null,
      remainingToday: CLAUDE_ENABLED ? remainingToday : 0,
      remainingForSession: CLAUDE_ENABLED ? remainingForSession : 0,
    },
    sources: adapterFactoryFromEnv().sources,
    browserSeeded,
    sessionStartedAt: new Date(session.createdAt).toISOString(),
  };
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

/** AI 계획: 예산 안이면 Claude를 실제로 호출하고, 아니면 녹화 응답으로 대체한 이유를 돌려준다. */
async function plan(session: Session): Promise<PlanResponse> {
  const started = Date.now();
  let planner: Planner = recordedPlanner();
  let fallbackReason: string | null = CLAUDE_ENABLED
    ? null
    : '서버에 Claude API 키가 설정되지 않았습니다';
  let acquired = false;

  if (CLAUDE_ENABLED) {
    const decision = budget.acquire(session.plansUsed);
    if (decision.allowed) {
      acquired = true;
      session.plansUsed += 1;
      planner = claudePlanner({ model: CLAUDE_MODEL, effort: CLAUDE_EFFORT });
    } else {
      fallbackReason = decision.reason;
    }
  }

  try {
    const results = await planAndGuard(session.db, planner);
    return {
      plannerId: planner.id,
      live: acquired,
      fallbackReason,
      proposalIds: results.flatMap((r) => (r.proposal ? [r.proposal.id] : [])),
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    if (!acquired) throw error;
    // Claude 호출이 실패하면 녹화 응답으로 대체하되, 실패했다는 사실을 숨기지 않는다
    const results = await planAndGuard(session.db, recordedPlanner());
    return {
      plannerId: 'recorded:claude-opus-5-5',
      live: false,
      fallbackReason: `Claude 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
      proposalIds: results.flatMap((r) => (r.proposal ? [r.proposal.id] : [])),
      elapsedMs: Date.now() - started,
    };
  } finally {
    if (acquired) budget.release();
  }
}

function serveStatic(request: IncomingMessage, response: ServerResponse) {
  if (!existsSync(STATIC_DIR))
    return send(response, 404, { error: '웹 빌드가 없습니다 (npm run build)' });
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
  const candidate = normalize(join(STATIC_DIR, pathname));
  // 경로 이탈(../) 방지
  const insideRoot = candidate.startsWith(STATIC_DIR);
  const file =
    insideRoot && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(STATIC_DIR, 'index.html');
  const immutable = file.includes(`${join(STATIC_DIR, 'assets')}`);
  response.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://x');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return send(response, 405, { error: '허용하지 않는 메서드' });
      return serveStatic(request, response);
    }

    if (request.method === 'GET' && url.pathname === '/api/health')
      return send(response, 200, { ok: true, sessions: sessions.size });

    const session = sessionFor(request, response);

    if (request.method === 'GET' && url.pathname === '/api/live') {
      response.setHeader('x-review-token', session.token);
      return send(response, 200, {
        snapshot: buildSnapshot(session.db, { scenario: 'live-sandbox', dataMode: 'recorded' }),
        live: liveStatus(session),
      });
    }

    if (request.method !== 'POST') return send(response, 404, { error: '없는 경로입니다' });
    const blocked = rejectCrossSite(request.headers, session.token, PUBLIC_HOSTS);
    if (blocked) return send(response, 403, { error: blocked });

    if (url.pathname === '/api/agent/plan') return send(response, 200, await plan(session));

    if (url.pathname === '/api/session/reset') {
      sessions.reset(session);
      return send(response, 200, { ok: true });
    }

    const match = DECISION_ROUTE.exec(url.pathname);
    if (!match) return send(response, 404, { error: '없는 경로입니다' });
    const parsed = decisionSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return send(response, 400, { error: parsed.error.issues[0]?.message ?? '잘못된 요청' });

    const id = Number(match[1]);
    const { reviewer, note } = parsed.data;
    const db = session.db;
    if (match[2] === 'approve') {
      const { adapterFor } = adapterFactoryFromEnv();
      return send(response, 200, await approve(db, id, { reviewer, note, adapterFor }));
    }
    if (match[2] === 'reject')
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
  console.log(`라이브 데모: http://${HOST}:${PORT}`);
  console.log(
    `  AI: ${CLAUDE_ENABLED ? `Claude 실시간 (${CLAUDE_MODEL})` : '녹화 응답 (ANTHROPIC_API_KEY 없음)'}`,
  );
  const { sources } = adapterFactoryFromEnv();
  console.log(
    `  수집: YouTube ${sources.youtube} · TikTok ${sources.tiktok} · Instagram ${sources.instagram} · 브라우저 시드 ${browserSeeded ? '포함' : '제외'}`,
  );
  if (PUBLIC_HOSTS.length > 0) console.log(`  공개 Host: ${PUBLIC_HOSTS.join(', ')}`);
});
