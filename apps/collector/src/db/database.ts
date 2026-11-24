import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * DB를 열고 아직 적용하지 않은 마이그레이션을 순서대로 적용한다.
 * 적용한 버전은 PRAGMA user_version에 기록한다. 마이그레이션 도구 없이 SQLite 기능만 쓴다.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

/**
 * 마이그레이션은 외래키 검사를 끈 상태로 한 트랜잭션에서 적용하고, 끝난 뒤 foreign_key_check로 무결성을 확인한다.
 * SQLite는 CHECK 제약을 ALTER로 바꿀 수 없어 테이블을 다시 만들어야 하는데(공식 12단계 절차),
 * 그 과정에서 참조 중인 테이블을 잠시 지우려면 외래키 검사를 꺼야 하기 때문이다.
 * PRAGMA foreign_keys는 트랜잭션 안에서 바꿀 수 없으므로 트랜잭션 밖에서 끄고 켠다.
 */
export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (version <= current) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(sql);
        const broken = db.pragma('foreign_key_check') as unknown[];
        if (broken.length > 0) throw new Error(`${file}: 외래키 무결성 위반 ${broken.length}건`);
        db.pragma(`user_version = ${version}`);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}
