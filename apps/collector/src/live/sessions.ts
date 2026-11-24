/**
 * 방문자별 샌드박스.
 *
 * 심사자마다 데모 DB의 독립된 사본을 메모리에 만들어 준다. 각자 AI 제안을 받고 승인·실행해도
 * 다른 방문자의 화면에 영향을 주지 않는다. 사본은 시드 DB를 serialize한 버퍼에서 만들어 수 ms면 된다.
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/database.ts';

export interface Session {
  id: string;
  /** 이 세션의 쓰기 요청에 필요한 토큰 (CSRF 방지) */
  token: string;
  db: Db;
  createdAt: number;
  lastSeen: number;
  plansUsed: number;
}

export interface SessionStoreOptions {
  maxSessions: number;
  ttlMs: number;
  now?: () => number;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private seed: Buffer;
  private readonly options: Required<SessionStoreOptions>;

  constructor(seed: Buffer, options: SessionStoreOptions) {
    this.seed = seed;
    this.options = { now: Date.now, ...options };
  }

  get size(): number {
    return this.sessions.size;
  }

  /** 기존 세션을 찾고, 없거나 만료됐으면 새로 만든다. 새로 만들었는지도 알려준다. */
  resolve(id: string | undefined): { session: Session; created: boolean } {
    const now = this.options.now();
    this.evictExpired(now);
    const existing = id ? this.sessions.get(id) : undefined;
    if (existing) {
      existing.lastSeen = now;
      return { session: existing, created: false };
    }
    return { session: this.create(now), created: true };
  }

  /** 같은 세션 ID로 데모 상태만 처음으로 되돌린다 (사용한 호출 횟수는 유지해 한도를 우회하지 못하게 한다) */
  reset(session: Session): Session {
    session.db.close();
    const fresh: Session = {
      ...session,
      db: new Database(this.seed),
      lastSeen: this.options.now(),
    };
    this.sessions.set(session.id, fresh);
    return fresh;
  }

  private create(now: number): Session {
    if (this.sessions.size >= this.options.maxSessions) this.evictOldest();
    const session: Session = {
      id: randomBytes(18).toString('base64url'),
      token: randomBytes(32).toString('base64url'),
      db: new Database(this.seed),
      createdAt: now,
      lastSeen: now,
      plansUsed: 0,
    };
    session.db.pragma('foreign_keys = ON');
    this.sessions.set(session.id, session);
    return session;
  }

  private evictExpired(now: number) {
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeen > this.options.ttlMs) {
        session.db.close();
        this.sessions.delete(id);
      }
    }
  }

  private evictOldest() {
    let oldest: Session | undefined;
    for (const session of this.sessions.values()) {
      if (!oldest || session.lastSeen < oldest.lastSeen) oldest = session;
    }
    if (oldest) {
      oldest.db.close();
      this.sessions.delete(oldest.id);
    }
  }
}
