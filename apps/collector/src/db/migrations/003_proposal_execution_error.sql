-- 실행 오류를 사람의 결정 사유와 분리해 저장한다.
-- 이전에는 실행이 실패하면 review_note를 오류 메시지로 덮어써서, 사람이 쓴 승인 사유가 사라졌다.
ALTER TABLE agent_proposal ADD COLUMN execution_error TEXT;
