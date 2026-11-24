/**
 * 플랫폼 변화 감지.
 *
 * 원본은 필드 이름이 바뀌면 여러 후보 이름을 순서대로 시도하고,
 * 다 실패하면 조용히 null로 흡수했다(legacy/src/pipeline/tracker/publicInstagramCollector.js:38).
 * 그래서 수집은 "성공"인데 데이터는 비어 있는 상태를 한참 뒤에야 알았다.
 *
 * 여기서는 실행마다 필드별로 값이 채워진 비율을 저장한다. 직전 정상 실행과 비교해
 * 평소 채워지던 필드가 갑자기 비면 schema_drift 경고를 남긴다.
 */
import type { SocialContent } from '../schema.ts';

export type FieldStats = Record<string, number>;

const TRACKED_FIELDS = {
  url: (item: SocialContent) => item.url,
  creatorHandle: (item: SocialContent) => item.creatorHandle,
  caption: (item: SocialContent) => (item.caption === '' ? null : item.caption),
  views: (item: SocialContent) => item.metrics.views,
  likes: (item: SocialContent) => item.metrics.likes,
  comments: (item: SocialContent) => item.metrics.comments,
} as const;

/** 필드별 채움 비율(0~1). 표본이 없으면 빈 객체다. */
export function fieldFillRates(items: readonly SocialContent[]): FieldStats {
  if (items.length === 0) return {};
  const stats: FieldStats = {};
  for (const [field, read] of Object.entries(TRACKED_FIELDS)) {
    const filled = items.filter((item) => read(item) !== null).length;
    stats[field] = Math.round((filled / items.length) * 1000) / 1000;
  }
  return stats;
}

export interface DriftFinding {
  field: string;
  before: number;
  after: number;
}

/**
 * 평소 대부분 채워지던 필드(이전 비율 ≥ 0.8)가 대부분 비면(현재 비율 ≤ 0.2) 변화로 본다.
 * 임계값을 넓게 잡은 이유: 게시물마다 좋아요 숨김 같은 개별 사정으로 생기는 결측을 오탐하지 않으려는 것이다.
 */
export function detectDrift(
  previous: FieldStats | null,
  current: FieldStats,
  sampleSize: number,
  { minSample = 5, wasFilled = 0.8, nowEmpty = 0.2 } = {},
): DriftFinding[] {
  if (!previous || sampleSize < minSample) return [];
  const findings: DriftFinding[] = [];
  for (const [field, after] of Object.entries(current)) {
    const before = previous[field];
    if (before !== undefined && before >= wasFilled && after <= nowEmpty) {
      findings.push({ field, before, after });
    }
  }
  return findings;
}
