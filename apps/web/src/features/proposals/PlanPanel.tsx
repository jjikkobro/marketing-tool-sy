import type { LiveStatus, PlanResponse, Proposal } from '@studio/collector/schema';
import { Bot, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface PlanPanelProps {
  live: LiveStatus | null;
  reviewable: boolean;
  running: boolean;
  result: PlanResponse | null;
  error: string | null;
  proposals: Proposal[];
  onPlan: () => void;
  onReset: () => void;
  /** 이 화면에서 무엇을 받는지 (같은 호출이 기획안·수집 제안·운영 조치를 함께 낸다) */
  title: string;
}

/** 같은 AI 호출의 결과를 종류별로 어느 화면에서 다루는지 */
const DESTINATIONS: { kinds: Proposal['kind'][]; label: string; to: string }[] = [
  { kinds: ['content_brief'], label: '기획안', to: '/planning' },
  { kinds: ['collect_query', 'retry_run'], label: '수집 제안', to: '/references' },
  { kinds: ['operator_action'], label: '운영 조치', to: '/admin/actions' },
];

/** AI 계획을 실행하는 자리. 지금 실시간으로 도는지, 녹화로 대체됐는지와 그 이유를 숨기지 않는다. */
export function PlanPanel({
  live,
  reviewable,
  running,
  result,
  error,
  proposals,
  onPlan,
  onReset,
  title,
}: PlanPanelProps) {
  const fresh = result ? proposals.filter((p) => result.proposalIds.includes(p.id)) : [];
  const passed = fresh.filter((p) => p.status === 'pending').length;

  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 border-charcoal p-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-ink-600">
          {!reviewable
            ? '정적 스냅샷에서는 실행할 수 없습니다. 아래는 이전 실행 기록입니다.'
            : live?.claude.enabled
              ? `Claude(${live.claude.model})가 수집 데이터를 읽고 기획안·수집 제안·운영 조치를 한 번에 냅니다. 남은 실시간 호출: 나 ${live.claude.remainingForSession}회 · 오늘 전체 ${live.claude.remainingToday}회`
              : '서버에 Claude API 키가 없어 녹화된 응답으로 실행합니다.'}
        </p>
        {running && (
          <p role="status" className="mt-2 text-xs font-semibold text-brand-700">
            Claude가 관찰 사실을 읽고 제안을 작성하는 중… <ElapsedSeconds />초 (보통 20~40초)
          </p>
        )}
        {result && !running && (
          <p role="status" className="mt-2 text-xs">
            <span className="font-semibold">
              {result.live ? 'Claude 실시간 응답' : '녹화 응답'} ·{' '}
              {Math.round(result.elapsedMs / 1000)}초
            </span>
            {' — '}새 제안 {fresh.length}건 중{' '}
            <strong className="text-positive">{passed}건 통과</strong>,{' '}
            <strong className="text-burgundy">{fresh.length - passed}건 가드 차단</strong>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {DESTINATIONS.map(({ kinds, label, to }) => {
                const count = fresh.filter(
                  (p) => kinds.includes(p.kind) && p.status === 'pending',
                ).length;
                return (
                  <Link key={to} to={to} className="text-ink-600 hover:text-brand-700">
                    {label} <strong className="text-charcoal tabular-nums">{count}</strong> →
                  </Link>
                );
              })}
            </span>
            {result.fallbackReason && (
              <span className="block text-tangerine-800">대체 이유: {result.fallbackReason}</span>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-burgundy">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={onPlan} disabled={!reviewable || running}>
          <Bot aria-hidden className="size-4" />
          {running ? '제안 받는 중…' : '제안 받기'}
        </Button>
        {reviewable && (
          <Button
            variant="ghost"
            onClick={onReset}
            disabled={running}
            title="내 샌드박스를 처음 상태로 되돌립니다"
          >
            <RotateCcw aria-hidden className="size-4" />
            처음으로
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * 호출 중일 때만 마운트되는 경과 시간. 매 호출마다 새로 마운트되므로 이전 호출의 시각이 남지 않는다.
 * 시각은 interval 콜백에서만 바꾼다.
 */
function ElapsedSeconds() {
  const [times, setTimes] = useState(() => ({ started: Date.now(), now: Date.now() }));
  useEffect(() => {
    const timer = setInterval(() => setTimes((t) => ({ ...t, now: Date.now() })), 500);
    return () => clearInterval(timer);
  }, []);
  return <>{Math.floor((times.now - times.started) / 1000)}</>;
}
