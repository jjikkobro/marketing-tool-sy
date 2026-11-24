/**
 * 어떤 수집 경로를 지금 쓸 수 있는지 환경 변수로 정한다. 화면 표시(sources)와 가드(capability)가 같은 규칙을 쓴다.
 *
 * - TikTok·Instagram 공식 API: 토큰이 있을 때만 실제로 호출한다.
 *   토큰 없이 검색 API가 켜져 있으면 공식 어댑터로의 새 수집은 막는다 (녹화본을 실제처럼 섞지 않기 위해).
 *   실제 키가 하나도 없으면 녹화 데모로 동작한다.
 * - 검색 API(search-tiktok, search-instagram): TAVILY_API_KEY가 있어야 한다.
 * - YouTube: YOUTUBE_API_KEY가 있어야 한다.
 */
import type { LiveStatus } from '../schema.ts';

type Env = Record<string, string | undefined>;

export function sourcesFromEnv(env: Env = process.env): LiveStatus['sources'] {
  const search = Boolean(env.TAVILY_API_KEY);
  return {
    youtube: env.YOUTUBE_API_KEY ? 'live' : 'off',
    tiktok: env.TIKTOK_RESEARCH_TOKEN ? 'official' : search ? 'search' : 'recorded',
    instagram: env.IG_ACCESS_TOKEN && env.IG_USER_ID ? 'official' : search ? 'search' : 'recorded',
  };
}

/** 실제 외부 데이터를 하나라도 수집할 수 있으면 live */
export function hasLiveCollection(env: Env = process.env): boolean {
  const sources = sourcesFromEnv(env);
  return (
    sources.youtube === 'live' || sources.tiktok !== 'recorded' || sources.instagram !== 'recorded'
  );
}

/** 새 수집을 이 어댑터로 실행할 수 있는지. 안 되면 이유를 돌려준다. */
export function collectUnavailableReason(adapterId: string, env: Env = process.env): string | null {
  const sources = sourcesFromEnv(env);
  switch (adapterId) {
    case 'youtube-data':
      return sources.youtube === 'live'
        ? null
        : 'YouTube API 키가 설정되지 않아 실행할 수 없습니다';
    case 'search-tiktok':
    case 'search-instagram':
      return env.TAVILY_API_KEY
        ? null
        : '검색 API 키(TAVILY_API_KEY)가 설정되지 않아 실행할 수 없습니다';
    case 'tiktok-research':
      return sources.tiktok === 'search'
        ? 'TikTok 공식 API는 계정 승인이 없어 비활성화했습니다. search-tiktok을 쓰세요'
        : null;
    case 'instagram-graph':
      return sources.instagram === 'search'
        ? 'Instagram 공식 API는 계정 승인이 없어 비활성화했습니다. search-instagram을 쓰세요'
        : null;
    default:
      return null;
  }
}
