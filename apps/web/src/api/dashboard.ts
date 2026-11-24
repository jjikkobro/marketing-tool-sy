import { queryOptions } from '@tanstack/react-query';
import { brands, dashboardOverview, trackedContents } from '../mocks/dashboard';
import type { Brand, DashboardOverview, TrackedContent } from '../types/content';

/*
 * 대시보드 데이터 접근 계층.
 * 지금은 데모 데이터를 돌려준다. 서버(apps/server)가 생기면 이 파일의 fetch 함수만 바꾸면 되고,
 * 화면 컴포넌트는 queryOptions만 쓰므로 고칠 필요가 없다.
 */

const DEMO_LATENCY_MS = 250;

function demo<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), DEMO_LATENCY_MS));
}

export const dashboardQueries = {
  overview: () =>
    queryOptions({
      queryKey: ['dashboard', 'overview'],
      queryFn: (): Promise<DashboardOverview> => demo(dashboardOverview),
    }),
  trackedContents: () =>
    queryOptions({
      queryKey: ['dashboard', 'tracked-contents'],
      queryFn: (): Promise<TrackedContent[]> => demo(trackedContents),
    }),
  brands: () =>
    queryOptions({
      queryKey: ['brands'],
      queryFn: (): Promise<Brand[]> => demo(brands),
      staleTime: Infinity,
    }),
};
