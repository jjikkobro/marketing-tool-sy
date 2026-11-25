import {
  describeInputs,
  toolDefinitions,
  toolNames,
  type ToolName,
} from '@studio/collector/mcp-tools';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { snapshotQuery } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';

const CONNECT_COMMAND = 'claude mcp add social-collector -- npx tsx apps/collector/src/mcp.ts';
const EXAMPLE_SEED = 'spicynoodlechallenge';

export function AgentPage() {
  const snapshot = useQuery(snapshotQuery());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent"
        title="MCP 연결"
        description="수집 데이터와 제안 기능을 MCP 도구로 열어, Claude Code 같은 AI가 데이터를 조회하고 다음 수집을 제안하게 합니다."
        actions={
          snapshot.data && (
            <SnapshotBadge
              generatedAt={snapshot.data.snapshot.generatedAt}
              scenario={snapshot.data.snapshot.scenario}
            />
          )
        }
      />

      <Card data-help="mcp-connect">
        <CardHeader
          title="연결하기"
          description="저장소를 클론하고 npm run demo를 한 번 실행한 뒤, Claude Code에 MCP 서버로 등록합니다."
        />
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <code className="flex-1 overflow-x-auto rounded-square bg-charcoal px-4 py-3 font-mono text-sm whitespace-nowrap text-white">
            {CONNECT_COMMAND}
          </code>
          <CopyButton text={CONNECT_COMMAND} />
        </div>
        <p className="border-t border-ink-100 px-6 py-3 text-xs text-ink-600">
          AI는 조회와 제안(propose_action)까지만 할 수 있습니다. 승인·실행 도구는 없어서, 제안은
          가드를 거친 뒤 사람이 "제안 검토" 화면에서 결정합니다.
        </p>
      </Card>

      <section aria-labelledby="tools-heading" className="space-y-3" data-help="mcp-tools">
        <h2 id="tools-heading" className="text-base font-semibold">
          공개한 도구 {toolNames.length}개
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {toolNames.map((name) => (
            <Card key={name} className="p-5">
              <p className="font-mono text-sm font-semibold text-brand-700">{name}</p>
              <p className="mt-1 text-sm font-medium">{toolDefinitions[name].title}</p>
              <p className="mt-1.5 text-sm text-ink-600">{toolDefinitions[name].description}</p>
              <ToolInputs name={name} />
            </Card>
          ))}
        </div>
      </section>

      {snapshot.isPending ? (
        <LoadingBlock className="h-64" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : (
        <Card>
          <CardHeader
            title="도구 응답 예시"
            description={`이 화면의 스냅샷으로 계산한 실제 응답입니다. related_hashtags({ seed: "${EXAMPLE_SEED}" })`}
          />
          <pre className="max-h-96 overflow-auto px-6 py-5 font-mono text-xs leading-relaxed">
            {JSON.stringify(snapshot.data.snapshot.related[EXAMPLE_SEED] ?? [], null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

function ToolInputs({ name }: { name: ToolName }) {
  const inputs = describeInputs(name);
  if (inputs.length === 0) return <p className="mt-3 text-xs text-ink-600">입력 없음</p>;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {inputs.map((input) => (
        <li
          key={input.name}
          title={input.description}
          className="rounded-full border border-ink-200 px-2.5 py-0.5 font-mono text-xs text-ink-600"
        >
          {input.name}
        </li>
      ))}
    </ul>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="secondary" onClick={() => void copy()} aria-live="polite">
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? '복사됨' : '복사'}
    </Button>
  );
}
