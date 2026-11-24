import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';

const STEPS = [
  { title: '관찰', detail: 'SQL로 계산한 사실만' },
  { title: 'LLM 제안', detail: 'factId로 근거 인용' },
  { title: '가드 7검사', detail: '숫자는 SQL과 대조' },
  { title: '사람의 결정', detail: '승인 · 거절 · 확인' },
  { title: '실행', detail: '승인 시 재검증 후' },
  { title: '기록', detail: '누가·왜·결과' },
] as const;

/** 에이전트 루프를 한 줄로 보여준다. 사람의 결정 단계만 오렌지로 강조한다. */
export function AgentLoop() {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="에이전트 동작 순서">
      {STEPS.map((step, index) => {
        const human = step.title === '사람의 결정';
        return (
          <Fragment key={step.title}>
            <li
              className={`rounded-square border px-3 py-2 ${human ? 'border-brand bg-brand-50' : 'border-ink-200 bg-white'}`}
            >
              <p className={`text-xs font-semibold ${human ? 'text-brand-700' : ''}`}>
                {step.title}
              </p>
              <p className="text-[11px] text-ink-600">{step.detail}</p>
            </li>
            {index < STEPS.length - 1 && (
              <li aria-hidden>
                <ArrowRight className="size-3.5 shrink-0 text-ink-400" />
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
