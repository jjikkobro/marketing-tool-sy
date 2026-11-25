-- 콘텐츠 초안(채택 기획안 → 초안 → 발행)과 Admin에서 고치는 프롬프트 지침을 추가한다.

-- 지침은 덮어쓰지 않고 버전을 쌓는다. 누가 언제 무엇으로 바꿨는지가 남아야 결과가 달라진 이유를 설명할 수 있다.
CREATE TABLE agent_config_version (
  id         INTEGER PRIMARY KEY,
  key        TEXT    NOT NULL CHECK (key IN ('brief_guidelines', 'draft_guidelines')),
  -- NULL은 "기본값으로 되돌림"
  value      TEXT    CHECK (value IS NULL OR (length(trim(value)) > 0 AND length(value) <= 2000)),
  updated_by TEXT    NOT NULL CHECK (length(trim(updated_by)) > 0),
  updated_at TEXT    NOT NULL
);
CREATE INDEX agent_config_version_key ON agent_config_version (key, id);

CREATE TABLE content_draft (
  id           INTEGER PRIMARY KEY,
  proposal_id  INTEGER NOT NULL REFERENCES agent_proposal (id),
  status       TEXT    NOT NULL CHECK (status IN ('blocked', 'draft', 'published', 'discarded')),
  title        TEXT    NOT NULL,
  script       TEXT    NOT NULL,
  caption      TEXT    NOT NULL,
  hashtags     TEXT    NOT NULL CHECK (json_valid(hashtags) AND json_type(hashtags) = 'array'),
  checks       TEXT    NOT NULL CHECK (json_valid(checks)),
  drafted_by   TEXT    NOT NULL,
  -- 어떤 지침 버전으로 썼는지 (기본값이면 NULL)
  guidelines_version INTEGER REFERENCES agent_config_version (id),
  created_at   TEXT    NOT NULL,
  edited_by    TEXT,
  reviewer     TEXT,
  review_note  TEXT,
  reviewed_at  TEXT,
  -- 발행·폐기는 사람의 결정이다. 결정자와 시각 없이는 그 상태가 될 수 없다
  CHECK ((status IN ('published', 'discarded')) = (reviewer IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (status <> 'discarded' OR length(trim(coalesce(review_note, ''))) > 0)
);
CREATE INDEX content_draft_proposal ON content_draft (proposal_id, id);
