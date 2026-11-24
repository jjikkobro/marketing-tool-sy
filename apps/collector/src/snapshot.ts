import { listProposals } from './agent/store.ts';
import type { Db } from './db/database.ts';
import {
  adapterHealth,
  listErrors,
  listRuns,
  relatedHashtags,
  searchContents,
  topHashtags,
} from './queries/index.ts';
import { snapshotSchema, type Snapshot } from './schema.ts';

/** 웹이 읽는 데이터. export(정적 파일)와 serve(로컬 API)가 같은 함수를 쓴다. */
export function buildSnapshot(
  db: Db,
  options: { scenario: string; dataMode: Snapshot['dataMode'] },
): Snapshot {
  const hashtags = topHashtags(db, { limit: 30 });
  return snapshotSchema.parse({
    generatedAt: new Date().toISOString(),
    scenario: options.scenario,
    dataMode: options.dataMode,
    runs: listRuns(db, { limit: 100 }),
    errors: listErrors(db, { limit: 500 }),
    health: adapterHealth(db),
    contents: searchContents(db, { limit: 500 }),
    hashtags,
    related: Object.fromEntries(
      hashtags
        .slice(0, 12)
        .map((tag) => [tag.hashtag, relatedHashtags(db, tag.hashtag, { limit: 8 })]),
    ),
    proposals: listProposals(db),
  });
}
