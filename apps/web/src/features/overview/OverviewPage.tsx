import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, ClipboardCheck, Play, Radar, ShieldCheck, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { snapshotQuery } from '../../api/snapshot';
import { LiveStatusCard } from '../../components/layout/LiveStatusCard';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ImpactPanel } from '../discovery/ImpactPanel';

const FLOW = [
  {
    icon: Radar,
    title: '1. 수집',
    body: 'TikTok·Instagram에서 키워드·해시태그로 콘텐츠를 모읍니다. 실패·누락·중복은 이유와 함께 기록합니다.',
  },
  {
    icon: Bot,
    title: '2. AI 제안',
    body: 'Claude가 수집 데이터를 읽고 "다음에 무엇을 수집할지"를 제안합니다. 근거는 데이터의 사실 ID로만 인용합니다.',
  },
  {
    icon: ShieldCheck,
    title: '3. 자동 검증',
    body: '가드가 8가지를 검사합니다. AI가 쓴 숫자가 SQL 값과 다르거나, 근거와 실행 대상이 어긋나면 사람에게 보내지 않습니다.',
  },
  {
    icon: UserCheck,
    title: '4. 사람의 승인',
    body: '통과한 제안만 검토 대기열에 올라갑니다. 사람이 근거를 보고 승인해야 실행됩니다.',
  },
  {
    icon: Play,
    title: '5. 실행·기록',
    body: '승인하는 순간 한 번 더 검증한 뒤 수집을 실행하고, 누가 무엇을 근거로 승인했는지 남깁니다.',
  },
] as const;

const PROBLEMS = [
  {
    before: '플랫폼마다 검색하고, 결과를 시트에 옮기고, 다음 키워드를 감으로 고른다',
    after: '수집·정리는 자동, 다음 키워드는 AI가 근거와 함께 제안 → 사람은 승인만',
  },
  {
    before: '수집이 일부 실패해도 "성공"으로 보여 빈 데이터로 판단한다',
    after: '실패·재시도·누락·플랫폼 구조 변화가 원인과 함께 기록된다',
  },
  {
    before: 'AI가 그럴듯한 숫자를 지어내도 걸러낼 방법이 없다',
    after: 'AI의 숫자는 SQL 값과 대조해, 틀리면 사람에게 가기 전에 차단한다',
  },
] as const;

export function OverviewPage() {
  const snapshot = useQuery(snapshotQuery());
  const navigate = useNavigate();
  const live = snapshot.data?.live ?? null;
  const canPlan = Boolean(snapshot.data?.reviewable);

  return (
    <div className="space-y-10">
      <header>
        <p className="font-display text-xs font-semibold tracking-[0.16em] text-brand-700 uppercase">
          Social Collector
        </p>
        <h1 className="mt-3 text-3xl leading-snug font-bold tracking-tight">
          지금 뜨는 숏폼 포맷을 찾아
          <br />
          <span className="text-brand-700">근거가 검증된 기획안으로 만드는 에이전트</span>
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-600">
          TikTok·Instagram·YouTube의 숏폼을 모아{' '}
          <strong className="text-charcoal">어떤 포맷이 반응을 얻는지</strong> 보여주고, AI가 그
          데이터로 콘텐츠 기획안을 씁니다. AI가 쓴 숫자는 데이터베이스 값과 대조해 틀리면 걸러내고,{' '}
          <strong className="text-charcoal">무엇을 만들지는 마케터가 채택·거절로 결정</strong>
          합니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => navigate('/proposals', { state: { autoPlan: canPlan } })}>
            <Bot aria-hidden className="size-4" />
            {canPlan ? 'AI 기획안 받아보기' : 'AI 기획안 보기'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/discovery')}>
            수집된 데이터 보기
          </Button>
        </div>
      </header>

      <section aria-labelledby="flow-heading">
        <h2 id="flow-heading" className="text-lg font-bold">
          어떻게 동작하나요
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">
          {FLOW.map(({ icon: Icon, title, body }) => {
            const human = title.includes('승인');
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

      <section
        aria-labelledby="try-heading"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
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
              title="수집 결과 확인"
              body="어떤 콘텐츠와 해시태그가 모였고, 무엇이 함께 쓰였는지 봅니다."
              to="/discovery"
              cta="수집 화면"
            />
            <TryStep
              n={2}
              title="AI에게 기획안 받기"
              body={
                canPlan
                  ? 'Claude가 지금 이 데이터를 읽고 기획안과 수집 제안을 씁니다 (보통 20~40초). 검증기가 무엇을 통과시키고 무엇을 막는지 봅니다.'
                  : 'AI 제안과 가드가 막은 이유를 봅니다.'
              }
              onClick={() => navigate('/proposals', { state: { autoPlan: canPlan } })}
              cta={canPlan ? 'AI 기획안 받기' : '기획안 보기'}
            />
            <TryStep
              n={3}
              title="승인하고 실행 결과 보기"
              body="통과한 제안 하나를 승인하면 실제 수집이 실행되고, 운영 모니터에 실행 기록이 생깁니다."
              to="/operations"
              cta="운영 모니터"
            />
          </ol>
        </div>
        <Card className="h-fit p-5">
          <p className="text-sm font-semibold">지금 이 화면에서</p>
          <div className="mt-3">
            <LiveStatusCard live={live} />
          </div>
        </Card>
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
            반영됩니다. 설치할 것이 없습니다.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">엔지니어·AI 도구 → MCP</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            Claude Code 같은 AI 도구가 같은 데이터를 조회하고 제안까지 할 수 있는 연결부입니다. 승인
            도구는 없어서 결정은 항상 사람이 웹에서 합니다.
          </p>
        </Card>
      </section>

      <section aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="text-lg font-bold">
          무엇이 달라지나요
        </h2>
        <div className="mt-4 overflow-hidden rounded-square border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs text-ink-600">
              <tr>
                <th className="px-5 py-2.5 font-medium">지금까지</th>
                <th className="px-5 py-2.5 font-medium">Social Collector</th>
              </tr>
            </thead>
            <tbody>
              {PROBLEMS.map((row) => (
                <tr key={row.before} className="border-t border-ink-100 align-top">
                  <td className="px-5 py-3 text-ink-600">{row.before}</td>
                  <td className="px-5 py-3 font-medium">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-600">
          설계 근거와 한계는{' '}
          <a
            className="font-semibold text-brand-700 hover:underline"
            href="https://github.com/jjikkobro/marketing-tool-sy#readme"
            target="_blank"
            rel="noopener noreferrer"
          >
            README
          </a>
          와 결정 기록(docs/decisions)에 있습니다.
        </p>
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
