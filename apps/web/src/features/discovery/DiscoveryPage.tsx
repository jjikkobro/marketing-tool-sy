import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { snapshotQuery } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { ContentTable } from './ContentTable';
import { HashtagPanel } from './HashtagPanel';
import { ImpactPanel } from './ImpactPanel';
import { RunSummaryStrip } from './RunSummaryStrip';

export function DiscoveryPage() {
  const snapshot = useQuery(snapshotQuery());
  const [hashtag, setHashtag] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Discovery"
        title="소셜 콘텐츠 수집"
        description="키워드와 해시태그로 TikTok·Instagram 콘텐츠를 모으고, 함께 쓰인 해시태그로 다음 탐색 범위를 넓힙니다."
        actions={
          snapshot.data && (
            <SnapshotBadge
              generatedAt={snapshot.data.snapshot.generatedAt}
              scenario={snapshot.data.snapshot.scenario}
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
          <ImpactPanel snapshot={snapshot.data.snapshot} />
          <RunSummaryStrip
            runs={snapshot.data.snapshot.runs}
            errors={snapshot.data.snapshot.errors}
          />
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <HashtagPanel
              hashtags={snapshot.data.snapshot.hashtags}
              related={snapshot.data.snapshot.related}
              selected={hashtag}
              onSelect={setHashtag}
            />
            <ContentTable
              contents={snapshot.data.snapshot.contents}
              hashtag={hashtag}
              recorded={snapshot.data.snapshot.dataMode === 'recorded'}
            />
          </div>
        </>
      )}
    </div>
  );
}
