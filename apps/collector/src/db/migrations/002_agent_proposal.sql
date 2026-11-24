-- 에이전트 제안과 사람의 결정.
-- LLM이 낸 제안, 가드의 검증 결과, 사람의 승인·거절, 실행 결과를 한 행에 남긴다.
-- 나중에 "누가 무엇을 근거로 무엇을 실행했는가"를 그대로 추적할 수 있게 하기 위해서다.

CREATE TABLE agent_proposal (
  id             INTEGER PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('collect_query', 'retry_run', 'operator_action')),
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
  -- 사람의 결정이 들어간 상태라면 누가, 언제 결정했는지가 반드시 있어야 한다
  CHECK (status IN ('blocked', 'pending') OR (reviewer IS NOT NULL AND reviewed_at IS NOT NULL)),
  -- 거절에는 이유가 있어야 한다
  CHECK (status <> 'rejected' OR (review_note IS NOT NULL AND length(trim(review_note)) > 0)),
  -- 실행 완료는 실행 기록과 연결되어야 한다
  CHECK (status <> 'executed' OR result_run_id IS NOT NULL)
);

CREATE INDEX agent_proposal_status ON agent_proposal (status, id);
