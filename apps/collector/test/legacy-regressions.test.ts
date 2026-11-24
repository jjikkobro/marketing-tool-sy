/**
 * 원본 툴에서 확인한 버그 3건의 회귀 테스트.
 * 각 테스트는 원본 동작을 재현하는 함수와 나란히 두어, 무엇이 왜 달라졌는지 바로 비교할 수 있게 했다.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalUrl, contentKey } from '../src/core/identity.ts';
import { sumKnown } from '../src/core/metrics.ts';

/** legacy/src/pipeline/social/collectors.js:77-82 를 그대로 옮긴 것 (비교용) */
function legacyFingerprint(item: {
  platform: string;
  url: string;
  externalId: string | null;
  title: string;
  body: string;
}) {
  const identity =
    item.url ||
    `${item.platform}:${item.externalId || ''}` ||
    `${item.platform}:${item.title}:${item.body}`;
  return createHash('sha256').update(identity.toLowerCase()).digest('hex');
}

describe('버그 1: 식별자가 없는 항목이 하나로 합쳐짐 (collectors.js:78-80)', () => {
  const a = {
    platform: 'instagram',
    url: '',
    externalId: null,
    title: '첫 번째 글',
    body: '본문 A',
  };
  const b = {
    platform: 'instagram',
    url: '',
    externalId: null,
    title: '전혀 다른 글',
    body: '본문 B',
  };

  it('원본: 서로 다른 두 글이 같은 fingerprint가 된다', () => {
    expect(legacyFingerprint(a)).toBe(legacyFingerprint(b));
  });

  it('수정: 식별할 수 없으면 키를 만들지 않는다 (합치지 않고 거부)', () => {
    expect(contentKey('instagram', { platformContentId: null, url: null })).toBeNull();
    expect(contentKey('instagram', { platformContentId: '', url: '' })).toBeNull();
  });

  it('수정: ID가 있으면 ID, 없으면 정규화한 URL을 쓴다', () => {
    expect(contentKey('tiktok', { platformContentId: '7300000000000000001' })).toBe(
      'tiktok:id:7300000000000000001',
    );
    expect(contentKey('web', { url: 'https://Example.com/post/1/?utm_source=x#top' })).toBe(
      'web:url:https://example.com/post/1',
    );
  });
});

describe('버그 2: 미수집 지표가 0으로 합산됨 (publicInstagramCollector.js:104)', () => {
  const legacyTotal = (likes: number | null, comments: number | null) =>
    (likes ?? 0) + (comments ?? 0);

  it('원본: 좋아요·댓글을 모두 못 받아도 반응 합계가 0이 된다', () => {
    expect(legacyTotal(null, null)).toBe(0);
  });

  it('수정: 아는 값이 하나도 없으면 null, 하나라도 있으면 아는 값만 더한다', () => {
    expect(sumKnown(null, null)).toBeNull();
    expect(sumKnown(null, 7)).toBe(7);
    expect(sumKnown(0, 0)).toBe(0);
    expect(sumKnown(undefined, Number.NaN)).toBeNull();
  });
});

describe('버그 3: 같은 게시물의 /p/와 /reel/ URL이 따로 저장됨 (collectors.js:64-75)', () => {
  it('Instagram 게시물 URL은 shortcode 기준으로 하나로 맞춘다', () => {
    const variants = [
      'https://www.instagram.com/p/DmO00000003/',
      'https://www.instagram.com/reel/DmO00000003/?igsh=abc',
      'http://instagram.com/reels/DmO00000003',
      'https://m.instagram.com/tv/DmO00000003/#comments',
    ];
    const canonical = new Set(variants.map(canonicalUrl));
    expect([...canonical]).toEqual(['https://www.instagram.com/p/DmO00000003']);
  });

  it('URL이 아닌 값은 그대로 두지 않고 null로 돌려준다', () => {
    expect(canonicalUrl('not a url')).toBeNull();
    expect(canonicalUrl('')).toBeNull();
  });
});
