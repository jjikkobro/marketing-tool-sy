/**
 * 승인된 제안을 실행할 어댑터를 고른다.
 * 실서비스 토큰이 있으면 실제 API 어댑터를, 없으면 녹화 응답 어댑터를 쓴다.
 * 어느 쪽으로 실행했는지 호출한 쪽이 알 수 있도록 mode를 함께 돌려준다.
 */
import { fetchTransport } from '../adapters/http.ts';
import { instagramGraphAdapter } from '../adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../adapters/tiktok-research.ts';
import { demoAdapterFactory } from '../demo/agent-adapters.ts';
import type { AdapterFactory } from './review.ts';

export function adapterFactoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): {
  mode: 'live' | 'recorded';
  adapterFor: AdapterFactory;
} {
  const { TIKTOK_RESEARCH_TOKEN, IG_ACCESS_TOKEN, IG_USER_ID } = env;
  if (!TIKTOK_RESEARCH_TOKEN && !(IG_ACCESS_TOKEN && IG_USER_ID)) {
    return { mode: 'recorded', adapterFor: demoAdapterFactory(now) };
  }
  const transport = fetchTransport();
  return {
    mode: 'live',
    adapterFor: (adapterId) => {
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
      throw new Error(`${adapterId} 실행에 필요한 토큰이 설정되지 않았습니다`);
    },
  };
}
