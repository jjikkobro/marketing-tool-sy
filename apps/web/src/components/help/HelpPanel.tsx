import { CircleHelp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { helpByPath, type HelpStep } from '../../app/help';
import { cn } from '../../lib/cn';

const OPEN_KEY = 'social-collector:help-open';
const HIGHLIGHT_MS = 3000;

/**
 * 화면 오른쪽 도움말. 단계를 누르면 그 영역(data-help)으로 스크롤하고 잠시 강조한다.
 * 접어 두면 오른쪽 위의 "도움말" 버튼만 남는다 (상태는 브라우저에 기억).
 */
export function HelpPanel() {
  const { pathname } = useLocation();
  const help = helpByPath[pathname];
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== 'closed');
  const [active, setActive] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const highlighted = useRef<{ element: Element; timer: number } | null>(null);

  // 화면을 옮기면(AppShell이 key로 다시 만든다) 남은 강조를 지운다
  useEffect(
    () => () => {
      const current = highlighted.current;
      if (!current) return;
      current.element.classList.remove('help-highlight');
      window.clearTimeout(current.timer);
    },
    [],
  );

  function clearHighlight() {
    if (!highlighted.current) return;
    highlighted.current.element.classList.remove('help-highlight');
    window.clearTimeout(highlighted.current.timer);
    highlighted.current = null;
  }

  function toggle(next: boolean) {
    setOpen(next);
    localStorage.setItem(OPEN_KEY, next ? 'open' : 'closed');
  }

  function show(step: HelpStep) {
    clearHighlight();
    const element = document.querySelector(`[data-help="${step.target}"]`);
    setActive(step.title);
    if (!element) {
      setMissing(step.title);
      return;
    }
    setMissing(null);
    if (step.expand) {
      const toggleButton = element.querySelector('[aria-expanded="false"]');
      if (toggleButton instanceof HTMLElement) toggleButton.click();
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('help-highlight');
    highlighted.current = {
      element,
      timer: window.setTimeout(() => {
        element.classList.remove('help-highlight');
        highlighted.current = null;
      }, HIGHLIGHT_MS),
    };
  }

  if (!help) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        className="fixed top-14 right-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-2 text-xs font-semibold text-charcoal shadow-sm hover:border-charcoal"
      >
        <CircleHelp aria-hidden className="size-4 text-brand-700" />
        도움말
      </button>
    );
  }

  return (
    <aside
      aria-label="도움말"
      className="hidden w-72 shrink-0 overflow-y-auto border-l border-ink-200 bg-white px-5 py-8 xl:block"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-500">
          <CircleHelp aria-hidden className="size-4 text-brand-700" />
          도움말
        </p>
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-label="도움말 닫기"
          className="rounded-full p-1 text-ink-500 hover:bg-ink-100 hover:text-charcoal"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <h2 className="mt-3 text-base font-bold">{help.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{help.summary}</p>

      <ol className="mt-5 space-y-1.5">
        {help.steps.map((step, index) => (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => show(step)}
              aria-current={active === step.title ? 'step' : undefined}
              className={cn(
                'flex w-full gap-3 rounded-square px-3 py-2.5 text-left transition-colors',
                active === step.title ? 'bg-brand-50' : 'hover:bg-ink-50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-semibold',
                  active === step.title ? 'bg-charcoal text-white' : 'bg-ink-100 text-ink-600',
                )}
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">
                  {step.body}
                </span>
                {missing === step.title && (
                  <span role="status" className="mt-1 block text-xs text-tangerine-800">
                    지금 화면에는 이 영역이 없습니다 (데이터를 불러오는 중이거나 비어 있음).
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-ink-500">단계를 누르면 화면의 해당 위치가 강조됩니다.</p>
    </aside>
  );
}
