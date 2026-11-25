import { referenceFactId, type Snapshot } from '@studio/collector/schema';
import { platformLabel } from '../../lib/labels';

export interface ReferenceLink {
  url: string;
  /** 실제로 열리는 게시물인지. 녹화(가상) 데이터의 URL은 열어도 없는 페이지라 링크를 걸지 않는다 */
  real: boolean;
  label: string;
}

/**
 * 기획안 근거(content:*, video:youtube:*)에서 원본 게시물로 가는 링크.
 * 실제 여부 판단은 레퍼런스 표(ContentTable)와 같다:
 * YouTube·검색 API는 항상 실제, 공식 API는 라이브 데이터일 때만, 브라우저(가상 피드)는 항상 가상.
 */
export function buildReferenceLinks(snapshot: Snapshot): ReadonlyMap<string, ReferenceLink> {
  return new Map(
    snapshot.contents.flatMap((content) => {
      if (!content.url) return [];
      const real =
        content.source !== 'browser' &&
        (content.platform === 'youtube' ||
          content.source === 'web-search' ||
          snapshot.dataMode === 'live');
      const handle = content.creatorHandle ? ` @${content.creatorHandle}` : '';
      return [
        [
          referenceFactId(content),
          { url: content.url, real, label: `${platformLabel[content.platform]}${handle}` },
        ],
      ];
    }),
  );
}
