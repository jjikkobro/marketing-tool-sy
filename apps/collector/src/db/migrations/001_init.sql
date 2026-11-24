-- 수집 저장소 초기 스키마
-- 테이블 3개: 콘텐츠, 수집 실행, 실행 중 오류.
-- 원본은 JSON 문자열 컬럼에 상태를 넣고 앱 코드에서 검사했다. 여기서는 CHECK 제약으로 DB가 직접 막는다.

CREATE TABLE content (
  id                  INTEGER PRIMARY KEY,
  platform            TEXT    NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'web')),
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

CREATE INDEX content_published_at ON content (published_at);

CREATE TABLE collection_run (
  id            INTEGER PRIMARY KEY,
  adapter_id    TEXT    NOT NULL,
  platform      TEXT    NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'web')),
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

-- 같은 어댑터와 쿼리 조합이 동시에 두 번 실행되지 않게 막는다.
-- 별도의 락 테이블 대신 부분 UNIQUE 인덱스 하나로 처리한다.
CREATE UNIQUE INDEX collection_run_one_running
  ON collection_run (adapter_id, query_kind, query_value)
  WHERE status = 'running';

CREATE INDEX collection_run_adapter ON collection_run (adapter_id, started_at);

CREATE TABLE collection_error (
  id          INTEGER PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES collection_run (id) ON DELETE CASCADE,
  stage       TEXT    NOT NULL CHECK (stage IN ('fetch', 'parse', 'store', 'drift')),
  kind        TEXT    NOT NULL CHECK (kind IN ('rate_limited', 'auth', 'server', 'network', 'invalid_response', 'schema_drift', 'truncated', 'unknown')),
  severity    TEXT    NOT NULL CHECK (severity IN ('error', 'warning')),
  message     TEXT    NOT NULL,
  http_status INTEGER,
  attempt     INTEGER,
  created_at  TEXT    NOT NULL
);

CREATE INDEX collection_error_run ON collection_error (run_id);
