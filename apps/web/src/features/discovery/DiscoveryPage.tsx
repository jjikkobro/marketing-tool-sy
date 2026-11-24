import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { snapshotQuery } from '../../api/snapshot';
import { SnapshotBadge } from '../../components/layout/SnapshotBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorMessage, LoadingBlock } from '../../components/ui/StateMessage';
import { ContentTable } from './ContentTable';
import { HashtagPanel } from './HashtagPanel';
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
          <RunSummaryStrip runs={snapshot.data.runs} errors={snapshot.data.errors} />
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
            <HashtagPanel
              hashtags={snapshot.data.hashtags}
              related={snapshot.data.related}
              selected={hashtag}
              onSelect={setHashtag}
            />
            <ContentTable contents={snapshot.data.contents} hashtag={hashtag} />
          </div>
        </>
      )}
    </div>
  );
}
