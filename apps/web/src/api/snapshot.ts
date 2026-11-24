import { snapshotSchema, type Snapshot } from '@studio/collector/schema';
import { queryOptions } from '@tanstack/react-query';

/*
 * 웹은 서버를 호출하지 않는다. collector가 SQLite에서 export한 스냅샷(public/data/snapshot.json)을 읽는다.
 * collector와 같은 zod 스키마로 런타임 검증을 하므로, 스키마가 바뀌었는데 스냅샷을 다시 만들지 않았다면
 * 화면이 잘못된 값을 보여주지 않고 오류를 낸다.
 */
async function fetchSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`);
  if (!response.ok) throw new Error(`스냅샷을 불러오지 못했습니다 (${response.status})`);
  return snapshotSchema.parse(await response.json());
}

export const snapshotQuery = () =>
  queryOptions({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
    staleTime: Infinity,
  });
