import { formatKst } from '../../lib/format';

/**
 * "녹화된 실행" 표시. 화면의 데이터가 실시간 수집 결과가 아니라
 * 녹화 응답으로 돌린 실행의 스냅샷이라는 점을 모든 화면에서 숨기지 않는다.
 */
export function SnapshotBadge({
  generatedAt,
  scenario,
}: {
  generatedAt: string;
  scenario: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600">
      <span aria-hidden className="size-1.5 rounded-full bg-tangerine" />
      녹화된 실행 · 시나리오 <code className="font-display text-charcoal">{scenario}</code> ·{' '}
      {formatKst(generatedAt)}
    </span>
  );
}
