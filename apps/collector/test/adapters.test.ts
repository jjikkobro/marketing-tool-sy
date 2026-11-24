import { describe, expect, it } from 'vitest';
import { parseJsonPreservingIds } from '../src/adapters/http.ts';
import { instagramGraphAdapter } from '../src/adapters/instagram-graph.ts';
import { tiktokResearchAdapter } from '../src/adapters/tiktok-research.ts';
import { igRecentMedia, ok, scriptedTransport, tiktokPage } from '../src/demo/fixtures.ts';

const now = new Date('2026-11-24T03:00:00Z');
const query = { kind: 'keyword', value: 'spicy noodle challenge' } as const;

function tiktok() {
  return tiktokResearchAdapter({
    transport: scriptedTransport([]),
    accessToken: 't',
    now: () => now,
  });
}

const seed = {
  id: '7028743950684949651',
  username: 'demo_creator_01',
  description: 'lol #pov',
  hashtags: ['POV', 'Avengers'],
  hoursAgo: 1,
  views: 1050,
  likes: 10,
  comments: 2,
  shares: 0,
};

describe('TikTok Research 어댑터', () => {
  it('2^53을 넘는 int64 ID를 정밀도 손실 없이 문자열로 보존한다', () => {
    const body = tiktokPage([seed], { now, cursor: 1, hasMore: false });
    expect(body).toContain('"id":7028743950684949651'); // 문서처럼 따옴표 없는 숫자
    // 일반 JSON.parse는 이 ID를 다른 값으로 바꾼다. 이 손실이 실제로 일어난다는 전제부터 확인한다.
    const naive = (JSON.parse(body) as { data: { videos: Array<{ id: number }> } }).data.videos[0]
      ?.id;
    expect(String(naive)).not.toBe('7028743950684949651');
    expect(tiktok().parsePage(body, query).items[0]?.platformContentId).toBe('7028743950684949651');
  });

  it('문서 응답 예시처럼 video_id로 와도 받아들이고, 필드명 차이를 경고로 남긴다', () => {
    const parsed = tiktok().parsePage(
      tiktokPage([seed], { now, cursor: 1, hasMore: false, idField: 'video_id' }),
      query,
    );
    expect(parsed.items).toHaveLength(1);
    expect(parsed.warnings).toEqual([expect.objectContaining({ kind: 'schema_drift' })]);
  });

  it('지표 필드가 응답에 없으면 0이 아니라 null로 둔다', () => {
    const parsed = tiktok().parsePage(
      tiktokPage([{ ...seed, views: null, shares: null }], { now, cursor: 1, hasMore: false }),
      query,
    );
    expect(parsed.items[0]?.metrics).toEqual({ views: null, likes: 10, comments: 2, shares: null });
  });

  it('ID가 없는 영상은 버리지 않고 거부 사유와 함께 돌려준다', () => {
    const parsed = tiktok().parsePage(
      tiktokPage([{ ...seed, id: null }], { now, cursor: 1, hasMore: false }),
      query,
    );
    expect(parsed.items).toHaveLength(0);
    expect(parsed.rejected[0]?.reason).toContain('id');
  });

  it('다음 페이지 요청에 cursor와 search_id를 함께 보낸다', async () => {
    const transport = scriptedTransport([ok('{}')]);
    const adapter = tiktokResearchAdapter({ transport, accessToken: 't', now: () => now });
    const { nextCursor } = adapter.parsePage(
      tiktokPage([seed], { now, cursor: 100, hasMore: true, searchId: '7160776277492814854' }),
      query,
    );
    await adapter.fetchPage(query, nextCursor);
    expect(transport.requests[0]?.body).toMatchObject({
      cursor: 100,
      search_id: '7160776277492814854',
      max_count: 100,
      start_date: '20261117',
      end_date: '20261124',
    });
  });
});

describe('Instagram Graph 어댑터', () => {
  const adapter = () =>
    instagramGraphAdapter({ transport: scriptedTransport([]), accessToken: 't', igUserId: '1' });
  const mediaSeed = {
    id: '17890000000000001',
    shortcode: 'DmO00000001',
    caption: 'Fire noodles #SpicyNoodleChallenge #한식',
    mediaType: 'VIDEO' as const,
    hoursAgo: 1,
    likes: 12,
    comments: 3,
  };

  it('좋아요를 숨긴 게시물(like_count 필드 없음)을 버리지 않고 likes=null로 저장한다', () => {
    // 회귀: zod v4에서 z.unknown()을 optional로 두지 않아 이 게시물이 통째로 거부된 적이 있다.
    const parsed = adapter().parsePage(
      igRecentMedia([{ ...mediaSeed, likes: null }], { now }),
      query,
    );
    expect(parsed.rejected).toEqual([]);
    expect(parsed.items[0]?.metrics.likes).toBeNull();
  });

  it('캡션에서 해시태그를 소문자로 뽑고 한글 해시태그도 인식한다', () => {
    const parsed = adapter().parsePage(igRecentMedia([mediaSeed], { now }), query);
    expect(parsed.items[0]?.hashtags).toEqual(['spicynoodlechallenge', '한식']);
  });

  it('after 커서가 매번 같으므로 paging.next URL을 그대로 다음 커서로 쓴다', () => {
    const next = 'https://graph.facebook.com/v27.0/1/recent_media?after=X';
    expect(adapter().parsePage(igRecentMedia([mediaSeed], { now, next }), query).nextCursor).toBe(
      next,
    );
    expect(adapter().parsePage(igRecentMedia([mediaSeed], { now }), query).nextCursor).toBeNull();
  });

  it('/reel/ permalink를 /p/로 정규화해 저장한다', () => {
    const parsed = adapter().parsePage(
      igRecentMedia([{ ...mediaSeed, path: 'reel' }], { now }),
      query,
    );
    expect(parsed.items[0]?.url).toBe('https://www.instagram.com/p/DmO00000001');
  });
});

describe('parseJsonPreservingIds', () => {
  it('지정한 필드만 문자열로 감싸고 다른 숫자는 그대로 둔다', () => {
    expect(parseJsonPreservingIds('{"id":9007199254740993,"view_count":5}', ['id'])).toEqual({
      id: '9007199254740993',
      view_count: 5,
    });
  });
});
