/**
 * Admin에서 고치는 에이전트 지침 (동적 설정).
 *
 * - 덮어쓰지 않고 버전을 쌓는다. 지금 값은 키별 마지막 버전이다. NULL 버전은 "기본값으로 되돌림"이다.
 * - 라이브 데모에서는 방문자 샌드박스 DB에 저장되므로, 한 방문자가 바꾼 지침이 다른 방문자에게 퍼지지 않는다.
 * - 지침은 프롬프트의 일부일 뿐이다. 근거·숫자 규칙은 코드(prompts.ts의 *_RULES)와 가드에 고정되어 있다.
 */
import { z } from 'zod';
import type { Db } from '../db/database.ts';
import { configKeySchema, type AgentConfig, type ConfigKey } from '../schema.ts';
import { DEFAULT_GUIDELINES, FIXED_RULES } from './prompts.ts';
import { ReviewError } from './review.ts';

export const GUIDELINES_MAX_LENGTH = 2000;

interface VersionRow {
  id: number;
  value: string | null;
  updated_by: string;
  updated_at: string;
}

export interface ActiveGuidelines {
  value: string;
  /** 기본값이면 null. 초안이 어떤 지침으로 쓰였는지 기록하는 데 쓴다 */
  versionId: number | null;
}

function latest(db: Db, key: ConfigKey): VersionRow | undefined {
  return db
    .prepare(
      'SELECT id, value, updated_by, updated_at FROM agent_config_version WHERE key = ? ORDER BY id DESC LIMIT 1',
    )
    .get(key) as VersionRow | undefined;
}

export function activeGuidelines(db: Db, key: ConfigKey): ActiveGuidelines {
  const row = latest(db, key);
  return row?.value
    ? { value: row.value, versionId: row.id }
    : { value: DEFAULT_GUIDELINES[key], versionId: null };
}

export function getConfig(db: Db, key: ConfigKey): AgentConfig {
  const row = latest(db, key);
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM agent_config_version WHERE key = ?')
    .get(key) as { n: number };
  return {
    key,
    value: row?.value ?? DEFAULT_GUIDELINES[key],
    defaultValue: DEFAULT_GUIDELINES[key],
    isDefault: !row?.value,
    fixedRules: FIXED_RULES[key],
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
    versions: n,
  };
}

export function listConfig(db: Db): AgentConfig[] {
  return configKeySchema.options.map((key) => getConfig(db, key));
}

const updateSchema = z.object({
  reviewer: z.string().trim().min(1, '수정한 사람 이름이 필요합니다').max(60),
  /** null이면 기본값으로 되돌린다 */
  value: z
    .string()
    .trim()
    .min(1, '지침이 비어 있습니다. 기본값으로 되돌리려면 "기본값으로"를 누르세요')
    .max(GUIDELINES_MAX_LENGTH, `지침은 ${GUIDELINES_MAX_LENGTH}자 이내로 씁니다`)
    .nullable(),
});

export function updateConfig(
  db: Db,
  key: ConfigKey,
  input: unknown,
  now: Date = new Date(),
): AgentConfig {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw new ReviewError(parsed.error.issues[0]?.message ?? '잘못된 설정');
  const { reviewer, value } = parsed.data;
  // 기본값과 같은 내용은 기본값으로 되돌린 것으로 기록한다 (다음에 기본값이 바뀌면 따라가도록)
  const stored = value === DEFAULT_GUIDELINES[key] ? null : value;
  db.prepare(
    'INSERT INTO agent_config_version (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)',
  ).run(key, stored, reviewer, now.toISOString());
  return getConfig(db, key);
}
