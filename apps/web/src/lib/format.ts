const numberFormatter = new Intl.NumberFormat('ko-KR');
const compactFormatter = new Intl.NumberFormat('ko-KR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** 값이 없으면 0이 아니라 '—'로 보여준다. 수집되지 않은 값과 실제 0을 구분하기 위해서다. */
const EMPTY = '—';

export function formatNumber(value: number | null): string {
  return value === null ? EMPTY : numberFormatter.format(value);
}

export function formatCompact(value: number | null): string {
  return value === null ? EMPTY : compactFormatter.format(value);
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? EMPTY : percentFormatter.format(ratio);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** 게시 후 경과일. 성과 판정 시점(D+3, D+7)을 보여줄 때 쓴다. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const MS_PER_DAY = 86_400_000;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
}
