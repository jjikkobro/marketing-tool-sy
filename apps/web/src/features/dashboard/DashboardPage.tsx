import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { dashboardQueries } from '../../api/dashboard';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatTile } from '../../components/ui/StatTile';
import { formatNumber } from '../../lib/format';
import { ChannelSummaryCard } from './ChannelSummaryCard';
import { ContentTrackingTable } from './ContentTrackingTable';

export function DashboardPage() {
  const overview = useQuery(dashboardQueries.overview());
  const contents = useQuery(dashboardQueries.trackedContents());
  const brands = useQuery(dashboardQueries.brands());

  const isRefreshing = overview.isFetching || contents.isFetching;

  function refresh() {
    void overview.refetch();
    void contents.refetch();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Performance"
        title="성과 대시보드"
        description="브랜드 SNS 게시물을 자동으로 수집하고, 성과를 판정해 다음 콘텐츠의 개선 방향을 찾습니다."
        actions={
          <Button onClick={refresh} disabled={isRefreshing}>
            <RefreshCw aria-hidden className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />
            지표 새로고침
          </Button>
        }
      />

      {overview.isPending ? (
        <SkeletonBlock className="h-28" />
      ) : overview.isError ? (
        <ErrorMessage />
      ) : (
        <>
          <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="최근 28일 추적" value={formatNumber(overview.data.trackedCount)} />
            <StatTile label="오늘 발행" value={formatNumber(overview.data.publishedToday)} />
            <StatTile
              label="개선 필요"
              value={formatNumber(overview.data.needsWorkCount)}
              hint="판정 근거와 개선 제안을 확인하세요"
              emphasis
            />
            <StatTile
              label="평가 유예 · 데이터 부족"
              value={formatNumber(overview.data.pendingCount)}
              hint="D+3 이전이거나 비교 표본 5개 미만"
            />
          </section>

          <section aria-label="채널 현황" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {overview.data.channels.map((summary) => (
              <ChannelSummaryCard key={summary.channel} summary={summary} />
            ))}
          </section>
        </>
      )}

      {contents.isPending || brands.isPending ? (
        <SkeletonBlock className="h-96" />
      ) : contents.isError || brands.isError ? (
        <ErrorMessage />
      ) : (
        <ContentTrackingTable contents={contents.data} brands={brands.data} />
      )}
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-square bg-ink-100 ${className}`} />;
}

function ErrorMessage() {
  return (
    <p
      role="alert"
      className="rounded-square border border-burgundy/20 bg-burgundy-50 px-5 py-4 text-sm text-burgundy"
    >
      데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
    </p>
  );
}
