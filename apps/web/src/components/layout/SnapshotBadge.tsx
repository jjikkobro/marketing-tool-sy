import { formatKst } from '../../lib/format';

/**
 * 지금 보는 데이터가 어디서 왔는지 모든 화면 오른쪽 위에 표시한다.
 * - 라이브 서버: 방문자 전용 샌드박스. AI 호출·승인·실행이 실제로 일어난다.
 * - 정적 배포: 녹화 응답으로 돌린 실행의 스냅샷 (읽기 전용).
 */
export function SnapshotBadge({
  generatedAt,
  scenario,
}: {
  generatedAt: string;
  scenario: string;
}) {
  const live = scenario === 'live-sandbox';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${live ? 'bg-positive' : 'bg-tangerine'}`}
      />
      {live ? (
        <>라이브 샌드박스 · 내 브라우저 전용</>
      ) : (
        <>
          녹화된 실행 스냅샷 · 시나리오{' '}
          <code className="font-display text-charcoal">{scenario}</code>
        </>
      )}{' '}
      · {formatKst(generatedAt)}
    </span>
  );
}
