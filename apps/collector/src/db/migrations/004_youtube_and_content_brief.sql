-- 플랫폼 youtube, 제안 종류 content_brief(AI 기획안), 오류 종류 quota_exhausted를 추가한다.
-- SQLite는 CHECK 제약을 ALTER로 바꿀 수 없어 공식 절차대로 테이블을 새로 만들어 옮긴다.
-- (외래키 검사는 migrate()가 끄고, 적용 후 foreign_key_check로 확인한다)

CREATE TABLE content_new (
  id                  INTEGER PRIMARY KEY,
  platform            TEXT    NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'web')),
  platform_content_id TEXT    NOT NULL,
  source              TEXT    NOT NULL CHECK (source IN ('official-api', 'browser')),
  url                 TEXT,
  creator_handle      TEXT,
  caption             TEXT    NOT NULL DEFAULT '',
  hashtags            TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(hashtags) AND json_type(hashtags) = 'array'),
  media_type          TEXT    NOT NULL CHECK (media_type IN ('video', 'image', 'carousel', 'unknown')),
  published_at        TEXT    NOT NULL,
  -- 지표는 NULL 허용: NULL은 "수집 못 함", 0은 "실제로 0"
  views               INTEGER CHECK (views IS NULL OR views >= 0),
  likes               INTEGER CHECK (likes IS NULL OR likes >= 0),
  comments            INTEGER CHECK (comments IS NULL OR comments >= 0),
  shares              INTEGER CHECK (shares IS NULL OR shares >= 0),
  matched_query       TEXT    NOT NULL,
  first_seen_run_id   INTEGER NOT NULL REFERENCES collection_run (id),
  last_seen_run_id    INTEGER NOT NULL REFERENCES collection_run (id),
  first_seen_at       TEXT    NOT NULL,
  last_seen_at        TEXT    NOT NULL,
  -- 중복 기준은 URL 해시가 아니라 플랫폼 고유 ID다 (docs/decisions/0001)
  UNIQUE (platform, platform_content_id)
);
INSERT INTO content_new (id, platform, platform_content_id, source, url, creator_handle, caption, hashtags, media_type, published_at, views, likes, comments, shares, matched_query, first_seen_run_id, last_seen_run_id, first_seen_at, last_seen_at) SELECT id, platform, platform_content_id, source, url, creator_handle, caption, hashtags, media_type, published_at, views, likes, comments, shares, matched_query, first_seen_run_id, last_seen_run_id, first_seen_at, last_seen_at FROM content;
DROP TABLE content;
ALTER TABLE content_new RENAME TO content;
CREATE INDEX content_published_at ON content (published_at);

CREATE TABLE collection_run_new (
  id            INTEGER PRIMARY KEY,
  adapter_id    TEXT    NOT NULL,
  platform      TEXT    NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube', 'web')),
  source        TEXT    NOT NULL CHECK (source IN ('official-api', 'browser')),
  query_kind    TEXT    NOT NULL CHECK (query_kind IN ('keyword', 'hashtag')),
  query_value   TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at    TEXT    NOT NULL,
  finished_at   TEXT,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  items_seen    INTEGER NOT NULL DEFAULT 0,
  inserted      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  duplicates    INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  retries       INTEGER NOT NULL DEFAULT 0,
  -- 필드별 채움 비율. 다음 실행에서 플랫폼 변화 감지의 기준이 된다
  field_stats   TEXT    CHECK (field_stats IS NULL OR json_valid(field_stats)),
  CHECK ((status = 'running') = (finished_at IS NULL))
);
INSERT INTO collection_run_new (id, adapter_id, platform, source, query_kind, query_value, status, started_at, finished_at, pages_fetched, items_seen, inserted, updated, duplicates, rejected, retries, field_stats) SELECT id, adapter_id, platform, source, query_kind, query_value, status, started_at, finished_at, pages_fetched, items_seen, inserted, updated, duplicates, rejected, retries, field_stats FROM collection_run;
DROP TABLE collection_run;
ALTER TABLE collection_run_new RENAME TO collection_run;
CREATE UNIQUE INDEX collection_run_one_running
  ON collection_run (adapter_id, query_kind, query_value)
  WHERE status = 'running';
CREATE INDEX collection_run_adapter ON collection_run (adapter_id, started_at);

CREATE TABLE collection_error_new (
  id          INTEGER PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES collection_run (id) ON DELETE CASCADE,
  stage       TEXT    NOT NULL CHECK (stage IN ('fetch', 'parse', 'store', 'drift')),
  kind        TEXT    NOT NULL CHECK (kind IN ('rate_limited', 'auth', 'server', 'network', 'invalid_response', 'schema_drift', 'truncated', 'quota_exhausted', 'unknown')),
  severity    TEXT    NOT NULL CHECK (severity IN ('error', 'warning')),
  message     TEXT    NOT NULL,
  http_status INTEGER,
  attempt     INTEGER,
  created_at  TEXT    NOT NULL
);
INSERT INTO collection_error_new (id, run_id, stage, kind, severity, message, http_status, attempt, created_at) SELECT id, run_id, stage, kind, severity, message, http_status, attempt, created_at FROM collection_error;
DROP TABLE collection_error;
ALTER TABLE collection_error_new RENAME TO collection_error;
CREATE INDEX collection_error_run ON collection_error (run_id);

CREATE TABLE agent_proposal_new (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('collect_query', 'retry_run', 'operator_action', 'content_brief')),
  status         TEXT    NOT NULL CHECK (status IN ('blocked', 'pending', 'approved', 'executed', 'failed', 'rejected', 'acknowledged')),
  title          TEXT    NOT NULL,
  rationale      TEXT    NOT NULL,
  adapter_id     TEXT,
  query_kind     TEXT    CHECK (query_kind IS NULL OR query_kind IN ('keyword', 'hashtag')),
  query_value    TEXT,
  run_id         INTEGER REFERENCES collection_run (id),
  evidence       TEXT    NOT NULL CHECK (json_valid(evidence) AND json_type(evidence) = 'array'),
  claims         TEXT    NOT NULL CHECK (json_valid(claims) AND json_type(claims) = 'array'),
  checks         TEXT    NOT NULL CHECK (json_valid(checks) AND json_type(checks) = 'array'),
  proposed_by    TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  reviewer       TEXT,
  review_note    TEXT,
  reviewed_at    TEXT,
  result_run_id  INTEGER REFERENCES collection_run (id),
  execution_error TEXT,
  -- 기획안(content_brief)의 포맷·훅·산출물·성공 기준
  plan           TEXT    CHECK (plan IS NULL OR (json_valid(plan) AND json_type(plan) = 'object')),
  -- 사람의 결정이 들어간 상태라면 누가, 언제 결정했는지가 반드시 있어야 한다
  CHECK (status IN ('blocked', 'pending') OR (reviewer IS NOT NULL AND reviewed_at IS NOT NULL)),
  -- 거절에는 이유가 있어야 한다
  CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND length(trim(review_note)) > 0)),
  -- 실행 완료는 실행 기록과 연결되어야 한다
  CHECK (status <> 'executed' OR result_run_id IS NOT NULL)
);
INSERT INTO agent_proposal_new (id, kind, status, title, rationale, adapter_id, query_kind, query_value, run_id, evidence, claims, checks, proposed_by, created_at, reviewer, review_note, reviewed_at, result_run_id, execution_error) SELECT id, kind, status, title, rationale, adapter_id, query_kind, query_value, run_id, evidence, claims, checks, proposed_by, created_at, reviewer, review_note, reviewed_at, result_run_id, execution_error FROM agent_proposal;
DROP TABLE agent_proposal;
ALTER TABLE agent_proposal_new RENAME TO agent_proposal;
CREATE INDEX agent_proposal_status ON agent_proposal (status, id);
