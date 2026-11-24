/** 값이 없으면 0이 아니라 '—'로 보여준다. 수집하지 못한 값과 실제 0을 구분하기 위해서다. */
const EMPTY = '—';

const numberFormatter = new Intl.NumberFormat('ko-KR');
const compactFormatter = new Intl.NumberFormat('ko-KR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 시간대를 명시한다. 지정하지 않으면 보는 사람의 브라우저 시간대에 따라 날짜가 달라진다. */
const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatNumber(value: number | null): string {
  return value === null ? EMPTY : numberFormatter.format(value);
}

export function formatCompact(value: number | null): string {
  return value === null ? EMPTY : compactFormatter.format(value);
}

export function formatKst(iso: string | null): string {
  return iso === null ? EMPTY : `${kstFormatter.format(new Date(iso))} KST`;
}
