import { useQuery } from '@tanstack/react-query';
import { snapshotQuery } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { AdapterHealthCard } from './AdapterHealthCard';
import { RunTable } from './RunTable';

export function OperationsPage() {
  const snapshot = useQuery(snapshotQuery());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="수집 운영 모니터"
        description="수집이 조용히 실패하지 않도록, 실행마다 재시도·누락·중복·구조 변화를 기록합니다."
        actions={
          snapshot.data && (
            <SnapshotBadge
              generatedAt={snapshot.data.generatedAt}
              scenario={snapshot.data.scenario}
            />
          )
        }
      />

      {snapshot.isPending ? (
        <LoadingBlock className="h-96" />
      ) : snapshot.isError ? (
        <ErrorMessage error={snapshot.error} />
      ) : (
        <>
          <section aria-label="어댑터 상태" className="grid gap-3 md:grid-cols-3">
            {snapshot.data.health.map((health) => (
              <AdapterHealthCard key={health.adapterId} health={health} />
            ))}
          </section>
          <RunTable runs={snapshot.data.runs} errors={snapshot.data.errors} />
        </>
      )}
    </div>
  );
}
