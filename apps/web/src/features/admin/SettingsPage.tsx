import type { AgentConfig, ConfigKey } from '@studio/collector/schema';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { saveConfig } from '../../api/snapshot';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { formatKst } from '../../lib/format';
import { ReviewerField } from '../workflow/ReviewerField';
import { useWorkspace } from '../workflow/useWorkspace';

const MAX_LENGTH = 2000;

const meta: Record<ConfigKey, { title: string; usedBy: string }> = {
  brief_guidelines: {
    title: '콘텐츠 기획 지침',
    usedBy: '2단계 콘텐츠 기획에서 AI가 기획안을 쓸 때',
  },
  draft_guidelines: {
    title: '초안 작성 지침',
    usedBy: '3단계 초안 발행에서 AI가 대본·캡션을 쓸 때',
  },
};

/**
 * Admin · 에이전트 설정 (동적 설정).
 * 톤·타깃·형식 같은 지침은 여기서 고치고 바로 다음 호출에 반영된다. 바꿀 때마다 버전이 남는다.
 * 근거·숫자 규칙은 코드에 고정되어 있어 고칠 수 없다. 지침을 어떻게 바꿔도 가드는 그대로다.
 */
export function SettingsPage() {
  const { snapshot } = useWorkspace();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="에이전트 설정"
        description="AI가 기획안과 초안을 쓸 때 따르는 지침을 고칩니다. 저장하면 다음 AI 호출부터 반영되고, 누가 언제 바꿨는지 버전으로 남습니다."
        actions={snapshot.data && <ReviewerField reviewable={snapshot.data.reviewable} />}
      />

      <Card data-help="settings-notice" className="flex gap-3 border-charcoal p-5 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" />
        <p>
          지침은 <strong>내 샌드박스에만</strong> 적용됩니다. 근거 인용·숫자 대조 같은 안전 규칙은
          코드에 고정되어 있어 여기서 바꿀 수 없습니다. 지침에 “조회수를 크게 써라”라고 적어도
          검증기가 그 숫자를 막습니다. 지침에 숫자(예: “2030”)를 쓰면 AI가 그대로 옮겨 적어 기획안이
          차단될 수 있으니, 숫자 대신 말로 적어 주세요.
        </p>
      </Card>

      {snapshot.isPending ? (
        <LoadingBlock className="h-96" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : snapshot.data.snapshot.config.length === 0 ? (
        <p className="text-sm text-ink-600">이 스냅샷에는 설정 정보가 없습니다.</p>
      ) : (
        snapshot.data.snapshot.config.map((config) => (
          <ConfigEditor
            key={`${config.key}:${config.versions}`}
            config={config}
            reviewable={snapshot.data.reviewable}
          />
        ))
      )}
    </div>
  );
}

function ConfigEditor({ config, reviewable }: { config: AgentConfig; reviewable: boolean }) {
  const { requireToken, refresh, reviewer } = useWorkspace();
  const [value, setValue] = useState(config.value);
  const save = useMutation({
    mutationFn: (next: string | null) =>
      saveConfig(config.key, { reviewer, value: next }, requireToken()),
    onSuccess: refresh,
  });
  const dirty = value !== config.value;
  const noReviewer = reviewer.trim() === '';

  return (
    <Card className="p-6" data-help={`config-${config.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{meta[config.key].title}</h2>
          <p className="text-xs text-ink-600">적용: {meta[config.key].usedBy}</p>
        </div>
        <p className="text-xs text-ink-600">
          {config.isDefault ? (
            <Badge tone="muted">기본값</Badge>
          ) : (
            <Badge tone="brand">수정됨</Badge>
          )}{' '}
          {config.updatedBy && (
            <>
              {config.updatedBy} · {formatKst(config.updatedAt)} ·{' '}
            </>
          )}
          버전 {config.versions}
        </p>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">{meta[config.key].title}</span>
        <textarea
          rows={7}
          value={value}
          readOnly={!reviewable}
          maxLength={MAX_LENGTH}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded-square border border-ink-300 px-3 py-2 font-mono text-[13px] leading-relaxed text-charcoal"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {reviewable && (
          <>
            <Button
              size="sm"
              disabled={!dirty || noReviewer || save.isPending || value.trim() === ''}
              onClick={() => save.mutate(value)}
            >
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={config.isDefault || noReviewer || save.isPending}
              onClick={() => save.mutate(null)}
            >
              기본값으로
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setValue(config.value)}>
                되돌리기
              </Button>
            )}
            {noReviewer && <span className="text-ink-600">검토자 이름을 먼저 입력하세요</span>}
          </>
        )}
        <span className="ml-auto text-ink-500 tabular-nums">
          {value.length}/{MAX_LENGTH}
        </span>
        {save.isError && (
          <span role="alert" className="basis-full text-burgundy">
            {save.error.message}
          </span>
        )}
      </div>

      <details className="mt-4 rounded-square bg-ink-50 px-4 py-3 text-xs">
        <summary className="cursor-pointer font-semibold text-ink-600">
          고정 규칙 보기 (수정 불가, 지침보다 우선)
        </summary>
        <pre className="mt-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-600">
          {config.fixedRules}
        </pre>
      </details>
    </Card>
  );
}
