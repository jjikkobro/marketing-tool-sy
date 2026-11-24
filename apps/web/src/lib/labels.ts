import type { ErrorKind, Platform, RunStatus, SourceKind } from '@studio/collector/schema';
import type { BadgeTone } from '../components/ui/Badge';

export const platformLabel: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  web: 'Web',
};

/** 출처 배지. 어떤 경로로 모은 데이터인지 항상 보이게 한다. */
export const sourceLabel: Record<SourceKind, string> = {
  'official-api': '공식 API',
  browser: '브라우저',
  'web-search': '검색 API',
};

export const statusMeta: Record<RunStatus, { label: string; tone: BadgeTone }> = {
  running: { label: '실행 중', tone: 'brand' },
  succeeded: { label: '성공', tone: 'positive' },
  partial: { label: '부분 실패', tone: 'caution' },
  failed: { label: '실패', tone: 'critical' },
};

export const errorKindLabel: Record<ErrorKind, string> = {
  rate_limited: '요청 한도',
  auth: '인증',
  server: '서버 오류',
  network: '네트워크',
  invalid_response: '응답 형식',
  schema_drift: '구조 변화',
  truncated: '잘림',
  quota_exhausted: '쿼터 소진',
  unknown: '기타',
};
