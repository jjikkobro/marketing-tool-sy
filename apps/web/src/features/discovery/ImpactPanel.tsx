import type { Snapshot } from '@studio/collector/schema';
import { Link } from 'react-router';

/**
 * 이 툴이 무엇을 바꾸는지 첫 화면에서 보여준다.
 * 숫자는 모두 지금 보고 있는 실행 기록(스냅샷)에서 계산한다. 지어낸 효과 수치를 쓰지 않기 위해서다.
 */
export function ImpactPanel({ snapshot }: { snapshot: Snapshot }) {
  const { runs, errors, proposals, contents, hashtags, related } = snapshot;
  const sum = (pick: (run: Snapshot['runs'][number]) => number) =>
    runs.reduce((total, run) => total + pick(run), 0);

  const brokenRuns = runs.filter(
    (run) => run.status === 'partial' || run.status === 'failed',
  ).length;
  const driftWarnings = errors.filter((error) => error.kind === 'schema_drift').length;
  const blocked = proposals.filter((p) => p.status === 'blocked').length;
  const pending = proposals.filter((p) => p.status === 'pending').length;
  const executed = proposals.filter((p) => p.status === 'executed').length;
  const seed = hashtags[0]?.hashtag;
  const firstRelated = seed ? related[seed]?.[0] : undefined;

  const columns = [
    {
      title: '생산성',
      lead: '키워드 검색 → 정리 → 다음 키워드 고르기를 자동화',
      items: [
        `콘텐츠 ${contents.length}건을 같은 형식으로 정리 (중복 ${sum((r) => r.duplicates)}건 자동 제거)`,
        `다음 수집 제안 ${proposals.length}건을 에이전트가 작성 → 사람은 승인만 (대기 ${pending} · 실행 ${executed})`,
      ],
      link: { to: '/planning', label: '콘텐츠 기획' },
    },
    {
      title: '비효율 개선',
      lead: '조용히 틀린 데이터로 판단하는 일을 없앰',
      items: [
        `문제 있던 실행 ${brokenRuns}건 모두 원인과 함께 기록 · 재시도 ${sum((r) => r.retries)}회로 일시 오류 흡수`,
        `플랫폼 구조 변화 ${driftWarnings}건 감지 · 중복 수집과 쿼터 낭비는 가드가 사전 차단`,
      ],
      link: { to: '/operations', label: '운영 모니터' },
    },
    {
      title: '인사이트',
      lead: '무엇이 뜨고, 다음에 무엇을 찾아볼지',
      items: [
        seed && firstRelated
          ? `#${seed} 콘텐츠 중 ${firstRelated.contents}건이 #${firstRelated.hashtag}를 함께 씀 → 다음 탐색 후보`
          : '함께 쓰인 해시태그로 다음 탐색 후보를 찾음',
        `LLM 제안 ${proposals.length}건 중 ${blocked}건은 근거·수치가 틀려 사람에게 가기 전에 차단`,
      ],
      link: { to: '/references', label: '레퍼런스 보기' },
    },
  ];

  return (
    <section
      aria-labelledby="impact-heading"
      className="rounded-square border border-ink-200 bg-sand-50"
    >
      <h2 id="impact-heading" className="border-b border-sand px-6 py-3 text-sm font-semibold">
        이 툴이 바꾸는 것{' '}
        <span className="font-normal text-ink-600">
          · 아래 숫자는 지금 보고 있는 실행 기록에서 계산
        </span>
      </h2>
      <div className="grid gap-px bg-sand md:grid-cols-3">
        {columns.map((column) => (
          <div key={column.title} className="bg-sand-50 px-6 py-4">
            <p className="font-display text-xs font-semibold tracking-wider text-brand-700">
              {column.title}
            </p>
            <p className="mt-1 text-sm font-semibold">{column.lead}</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-600">
              {column.items.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
            <Link
              to={column.link.to}
              className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline"
            >
              {column.link.label} →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
