/**
 * 지표 계산. "없음(null)"과 "0"을 끝까지 구분한다.
 *
 * 원본(legacy/src/pipeline/tracker/publicInstagramCollector.js:104)은
 * `(likes ?? 0) + (comments ?? 0)`로 반응 합계를 계산했다.
 * 그래서 Instagram이 좋아요를 숨긴 게시물(like_count 필드가 아예 빠짐)도 반응이 0인 게시물로 기록되어
 * "개선 필요"로 잘못 판정됐다.
 */

/** 값이 하나도 없으면 null, 하나라도 있으면 있는 값만 더한다. */
export function sumKnown(...values: Array<number | null | undefined>): number | null {
  let total: number | null = null;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

/** 숫자처럼 보이는 값만 정수로 받는다. 문자열 "1,050"이나 음수는 버린다. */
export function toMetric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

/** 조회수가 없거나 0이면 반응률을 계산할 수 없다(null). 0%와 구분한다. */
export function engagementRate(engagements: number | null, views: number | null): number | null {
  if (engagements === null || views === null || views === 0) return null;
  return engagements / views;
}
