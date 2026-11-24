/**
 * 승인된 제안을 실행할 어댑터를 고른다. 어떤 경로를 쓸 수 있는지는 availability.ts가 정한다.
 * - YouTube: YOUTUBE_API_KEY로 실제 API 수집
 * - TikTok·Instagram: 공식 토큰이 있으면 공식 API, 없으면 검색 API(TAVILY_API_KEY)로 실제 공개 게시물을 찾는다.
 *   둘 다 없으면 공식 응답 형식의 녹화본으로 실행한다 (녹화 데모).
 * 녹화된 과거 실행의 재실행(retry_run)은 녹화본으로 다시 돌린다.
 */
import type { LiveStatus } from '../schema.ts';
import { fetchTransport } from '../adapters/http.ts';
import { instagramGraphAdapter } from '../adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../adapters/tiktok-research.ts';
import { webSearchAdapter } from '../adapters/web-search.ts';
import { youtubeDataAdapter } from '../adapters/youtube-data.ts';
import { demoAdapterFactory } from '../demo/agent-adapters.ts';
import { hasLiveCollection, sourcesFromEnv } from './availability.ts';
import type { AdapterFactory } from './review.ts';

export function adapterFactoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): { mode: 'live' | 'recorded'; sources: LiveStatus['sources']; adapterFor: AdapterFactory } {
  const { TIKTOK_RESEARCH_TOKEN, IG_ACCESS_TOKEN, IG_USER_ID, YOUTUBE_API_KEY, TAVILY_API_KEY } =
    env;
  const recorded = demoAdapterFactory(now);
  const transport = fetchTransport();

  return {
    mode: hasLiveCollection(env) ? 'live' : 'recorded',
    sources: sourcesFromEnv(env),
    adapterFor: (adapterId, query) => {
      if (adapterId === 'youtube-data') {
        if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY가 설정되지 않았습니다');
        return youtubeDataAdapter({ transport, apiKey: YOUTUBE_API_KEY });
      }
      if (adapterId === 'search-tiktok' || adapterId === 'search-instagram') {
        if (!TAVILY_API_KEY) throw new Error('TAVILY_API_KEY가 설정되지 않았습니다');
        return webSearchAdapter({
          transport,
          apiKey: TAVILY_API_KEY,
          platform: adapterId === 'search-tiktok' ? 'tiktok' : 'instagram',
        });
      }
      if (adapterId === 'tiktok-research' && TIKTOK_RESEARCH_TOKEN) {
        return tiktokResearchAdapter({ transport, accessToken: TIKTOK_RESEARCH_TOKEN });
      }
      if (adapterId === 'instagram-graph' && IG_ACCESS_TOKEN && IG_USER_ID) {
        return instagramGraphAdapter({
          transport,
          accessToken: IG_ACCESS_TOKEN,
          igUserId: IG_USER_ID,
        });
      }
      return recorded(adapterId, query);
    },
  };
}
