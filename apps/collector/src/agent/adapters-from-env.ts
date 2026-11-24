/**
 * 승인된 제안을 실행할 어댑터를 고른다.
 * - YouTube: YOUTUBE_API_KEY가 있으면 실제 API로 수집한다. 없으면 실행할 수 없다 (가드가 미리 막는다).
 * - TikTok·Instagram: 실서비스 토큰이 있으면 실제 API, 없으면 공식 응답 형식의 녹화본으로 실행한다.
 * 플랫폼별로 무엇이 실제이고 무엇이 녹화인지 sources로 함께 돌려줘 화면에 그대로 보여준다.
 */
import type { LiveStatus } from '../schema.ts';
import { fetchTransport } from '../adapters/http.ts';
import { instagramGraphAdapter } from '../adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../adapters/tiktok-research.ts';
import { youtubeDataAdapter } from '../adapters/youtube-data.ts';
import { demoAdapterFactory } from '../demo/agent-adapters.ts';
import type { AdapterFactory } from './review.ts';

export function adapterFactoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): { mode: 'live' | 'recorded'; sources: LiveStatus['sources']; adapterFor: AdapterFactory } {
  const { TIKTOK_RESEARCH_TOKEN, IG_ACCESS_TOKEN, IG_USER_ID, YOUTUBE_API_KEY } = env;
  const sources: LiveStatus['sources'] = {
    youtube: YOUTUBE_API_KEY ? 'live' : 'off',
    tiktok: TIKTOK_RESEARCH_TOKEN ? 'live' : 'recorded',
    instagram: IG_ACCESS_TOKEN && IG_USER_ID ? 'live' : 'recorded',
  };
  const recorded = demoAdapterFactory(now);
  const transport = fetchTransport();

  return {
    mode: Object.values(sources).includes('live') ? 'live' : 'recorded',
    sources,
    adapterFor: (adapterId, query) => {
      if (adapterId === 'youtube-data') {
        if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY가 설정되지 않았습니다');
        return youtubeDataAdapter({ transport, apiKey: YOUTUBE_API_KEY });
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
