/**
 * 데모용 어댑터 팩토리: 사람이 승인한 제안을 키 없이 실행할 수 있게 녹화 응답을 만든다.
 * 쿼리 문자열에서 결정적으로 값을 만들기 때문에, 같은 쿼리는 항상 같은 결과가 나온다.
 */
import { instagramGraphAdapter } from '../adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../adapters/tiktok-research.ts';
import type { AdapterFactory } from '../agent/review.ts';
import { igHashtagSearch, igRecentMedia, ok, scriptedTransport, tiktokPage } from './fixtures.ts';

function seedOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 9_973;
  return hash;
}

export function demoAdapterFactory(now: Date): AdapterFactory {
  return (adapterId, query) => {
    const seed = seedOf(`${adapterId}:${query.kind}:${query.value}`);
    const tag = query.value.replace(/^#/, '').toLowerCase().replaceAll(' ', '');

    if (adapterId === 'tiktok-research') {
      const videos = Array.from({ length: 6 }, (_, i) => ({
        id: `74${String(seed).padStart(5, '0')}${String(i + 1).padStart(12, '0')}`,
        username: `demo_creator_${String(((seed + i) % 12) + 1).padStart(2, '0')}`,
        description: `${query.value} take ${i + 1} #${tag}`,
        hashtags: [tag, 'foodtok', i % 2 ? 'spicyfood' : 'mukbang'],
        hoursAgo: (i + 1) * 3,
        views: 8_000 + ((seed * (i + 3)) % 90_000),
        likes: 300 + ((seed * (i + 7)) % 9_000),
        comments: 10 + ((seed + i * 13) % 400),
        shares: 2 + ((seed + i) % 150),
      }));
      return tiktokResearchAdapter({
        transport: scriptedTransport([ok(tiktokPage(videos, { now, cursor: 6, hasMore: false }))]),
        accessToken: 'demo-token',
        now: () => now,
      });
    }

    if (adapterId === 'instagram-graph') {
      const media = Array.from({ length: 5 }, (_, i) => ({
        id: `1795${String(seed).padStart(5, '0')}${String(i + 1).padStart(8, '0')}`,
        shortcode: `DmA${String(seed).padStart(5, '0')}${i}`,
        caption: `${query.value} at home #${tag} #koreanfood`,
        mediaType: 'VIDEO' as const,
        hoursAgo: i + 1,
        likes: 100 + ((seed * (i + 2)) % 3_000),
        comments: 2 + ((seed + i) % 80),
      }));
      return instagramGraphAdapter({
        transport: scriptedTransport([
          ok(igHashtagSearch(`1784${String(seed).padStart(13, '0')}`)),
          ok(igRecentMedia(media, { now })),
        ]),
        accessToken: 'demo-token',
        igUserId: '17841400000000000',
      });
    }

    throw new Error(`데모에서 실행할 수 없는 어댑터: ${adapterId}`);
  };
}
