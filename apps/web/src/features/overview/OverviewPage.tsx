import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, ClipboardCheck, Play, Radar, ShieldCheck, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { snapshotQuery } from '../../api/snapshot';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ImpactPanel } from '../discovery/ImpactPanel';

const FLOW = [
  {
    icon: Radar,
    title: '1. 레퍼런스 수집',
    body: 'TikTok·Instagram·YouTube에서 숏폼 수집',
    human: false,
  },
  {
    icon: Bot,
    title: '2. AI 기획 + 자동 검증',
    body: 'AI가 수집 데이터의 포맷을 근거로 기획안 작성',
    human: false,
  },
  {
    icon: UserCheck,
    title: '3. 마케터의 채택',
    body: '마케터는 기획안을 채택하거나 사유를 남기고 거절',
    human: true,
  },
  {
    icon: ShieldCheck,
    title: '4. 초안 작성 + 검증',
    body: '채택한 기획안으로 AI가 장면별 대본과 캡션 작성',
    human: false,
  },
  {
    icon: Play,
    title: '5. 발행 확정',
    body: '마케터가 초안을 고쳐 최종본으로 확정',
    human: true,
  },
] as const;

export function OverviewPage() {
  const snapshot = useQuery(snapshotQuery());
  const navigate = useNavigate();
  const canPlan = Boolean(snapshot.data?.reviewable);

  return (
    <div className="space-y-10">
      <header data-help="overview-hero">
        <p className="font-display text-xs font-semibold tracking-[0.16em] text-brand-700 uppercase">
          Social Collector
        </p>
        <h1 className="mt-3 text-3xl leading-snug font-bold tracking-tight">
          지금 뜨는 숏폼 포맷을 찾아
          <br />
          <span className="text-brand-700">기획안으로 만드는 에이전트</span>
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-600">
          TikTok·Instagram·YouTube의 숏폼을 모아{' '}
          <strong className="text-charcoal">어떤 포맷이 반응을 얻는지</strong> 보여주고, AI가 그
          데이터로 콘텐츠 기획안을 씁니다.{' '}
          <strong className="text-charcoal">무엇을 만들지는 마케터가 채택·거절로 결정</strong>
          합니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => navigate('/planning', { state: { autoPlan: canPlan } })}>
            <Bot aria-hidden className="size-4" />
            {canPlan ? 'AI 기획안 받아보기' : 'AI 기획안 보기'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/references')}>
            수집한 레퍼런스 보기
          </Button>
        </div>
      </header>

      <section aria-labelledby="flow-heading" data-help="overview-flow">
        <h2 id="flow-heading" className="text-lg font-bold">
          어떻게 동작하나요
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">
          {FLOW.map(({ icon: Icon, title, body, human }) => {
            return (
              <li key={title}>
                <Card className={`h-full p-4 ${human ? 'border-brand bg-brand-50' : ''}`}>
                  <Icon
                    aria-hidden
                    className={`size-5 ${human ? 'text-brand-700' : 'text-charcoal'}`}
                    strokeWidth={1.75}
                  />
                  <p className="mt-3 text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{body}</p>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="try-heading" data-help="overview-try" className="grid gap-6">
        <div>
          <h2 id="try-heading" className="text-lg font-bold">
            1분 안에 직접 해보기
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {canPlan
              ? '내 브라우저 전용 샌드박스가 만들어졌습니다. 무엇을 눌러도 다른 사람의 화면에는 영향이 없습니다.'
              : '지금은 정적 스냅샷이라 기록만 볼 수 있습니다. 라이브 서버에서 열면 직접 실행할 수 있습니다.'}
          </p>
          <ol className="mt-4 space-y-2">
            <TryStep
              n={1}
              title="레퍼런스 수집"
              body="모인 숏폼과 해시태그를 보고, 에이전트의 수집 제안을 승인하면 그 자리에서 수집되어 표에 들어옵니다."
              to="/references"
              cta="레퍼런스 수집"
            />
            <TryStep
              n={2}
              title="콘텐츠 기획"
              body={
                canPlan
                  ? 'Claude가 지금 이 데이터를 읽고 기획안을 씁니다 (보통 20~40초). 검증기가 무엇을 통과시키고 무엇을 막는지 보고, 마음에 드는 기획안을 채택합니다.'
                  : 'AI 기획안과 가드가 막은 이유를 봅니다.'
              }
              onClick={() => navigate('/planning', { state: { autoPlan: canPlan } })}
              cta={canPlan ? 'AI 기획안 받기' : '기획안 보기'}
            />
            <TryStep
              n={3}
              title="초안 발행"
              body="채택한 기획안으로 AI가 대본·캡션 초안을 씁니다. 고쳐서 발행을 확정합니다."
              to="/drafts"
              cta="초안 발행"
            />
          </ol>
        </div>
      </section>

      {snapshot.data && <ImpactPanel snapshot={snapshot.data.snapshot} />}

      <section aria-labelledby="roles-heading" className="grid gap-3 md:grid-cols-2">
        <h2 id="roles-heading" className="sr-only">
          누가 무엇을 쓰나요
        </h2>
        <Card className="p-5">
          <p className="text-sm font-semibold">마케터 → 이 웹 화면</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            포맷과 근거 콘텐츠를 보고, AI 기획안을 채택·거절합니다. 거절 사유는 다음 기획에
            반영됩니다.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">엔지니어·AI 도구 → MCP</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            웹이 아니어도 Claude Code 같은 AI 도구로 데이터를 조회하고 제안까지 할 수 있는
            도구입니다.
          </p>
        </Card>
      </section>
    </div>
  );
}

function TryStep(props: {
  n: number;
  title: string;
  body: string;
  cta: string;
  to?: string;
  onClick?: () => void;
}) {
  const action = props.to ? (
    <Link
      to={props.to}
      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
    >
      {props.cta} <ArrowRight aria-hidden className="size-4" />
    </Link>
  ) : (
    <Button size="sm" onClick={props.onClick}>
      <ClipboardCheck aria-hidden className="size-3.5" />
      {props.cta}
    </Button>
  );
  return (
    <li className="flex items-center gap-4 rounded-square border border-ink-200 bg-white px-5 py-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-charcoal font-display text-sm font-semibold text-white">
        {props.n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{props.title}</p>
        <p className="mt-0.5 text-xs text-ink-600">{props.body}</p>
      </div>
      {action}
    </li>
  );
}
