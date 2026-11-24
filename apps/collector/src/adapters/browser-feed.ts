/**
 * 브라우저 자동화 어댑터 (Playwright)
 *
 * 대상은 실제 SNS가 아니라 저장소 안의 가상 피드(fixtures/mock-feed/*.html)다.
 * 로그인이 필요한 페이지 수집이나 차단 우회는 하지 않는다 (docs/decisions/0001).
 * 이 어댑터로 보여주려는 것은 "마크업이 바뀌었을 때 조용히 0건이 되지 않고 원인을 남기는가"다.
 *
 * fetchPage는 브라우저에서 원시 값만 뽑아 JSON 문자열로 넘긴다. 해석은 parsePage(순수 함수)가 한다.
 * 그래서 브라우저 없이도 parsePage를 테스트할 수 있다.
 */
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { CollectorError } from '../core/errors.ts';
import { canonicalUrl } from '../core/identity.ts';
import type { SocialContent } from '../schema.ts';
import { truncateSample, type ParsedPage, type Rejection, type SourceAdapter } from './types.ts';

export const SELECTORS = {
  card: 'article.feed-card',
  link: 'a.feed-link',
  caption: '.feed-caption',
  views: '.feed-views',
} as const;

const extractionSchema = z.object({
  /** 페이지 본문에 보이는 블록 수. 셀렉터 결과와 비교해 "진짜 0건"과 "셀렉터 깨짐"을 구분한다. */
  visibleBlocks: z.number().int(),
  cards: z.array(
    z.object({
      id: z.string().nullable(),
      href: z.string().nullable(),
      caption: z.string().nullable(),
      viewsText: z.string().nullable(),
    }),
  ),
});

const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;

/** "12,345 views" → 12345. 숫자를 찾지 못하면 null (0이 아니다). */
export function parseViews(text: string | null): number | null {
  const digits = text?.match(/[\d,]+/)?.[0]?.replaceAll(',', '');
  return digits ? Number(digits) : null;
}

export function browserFeedAdapter(options: { pageFile: string; now?: () => Date }): SourceAdapter {
  const now = options.now ?? (() => new Date());

  return {
    id: 'browser-feed',
    platform: 'web',
    source: 'browser',

    async fetchPage(): Promise<string> {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch().catch((error: unknown) => {
        // 재시도해도 나아지지 않으므로 network(재시도 대상)가 아니라 unknown으로 분류한다
        throw new CollectorError('unknown', `브라우저를 실행할 수 없습니다: ${String(error)}`);
      });
      try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(options.pageFile).href);
        // 이 함수는 브라우저로 직렬화되어 실행된다. 안에 이름 붙은 함수를 만들면 tsx(esbuild)가 끼워 넣는
        // __name 헬퍼가 브라우저에 없어 ReferenceError가 난다. 그래서 헬퍼 없이 인라인으로 쓴다.
        const extracted = await page.evaluate(
          (s) => ({
            visibleBlocks: document.querySelectorAll('main > *').length,
            cards: [...document.querySelectorAll(s.card)].map((card) => ({
              id: card.getAttribute('data-id'),
              href: card.querySelector(s.link)?.getAttribute('href') ?? null,
              caption: card.querySelector(s.caption)?.textContent?.trim() ?? null,
              viewsText: card.querySelector(s.views)?.textContent?.trim() ?? null,
            })),
          }),
          SELECTORS,
        );
        return JSON.stringify(extracted);
      } finally {
        await browser.close();
      }
    },

    parsePage(body: string): ParsedPage {
      const extracted = extractionSchema.parse(JSON.parse(body));
      if (extracted.cards.length === 0 && extracted.visibleBlocks > 0) {
        throw new CollectorError(
          'schema_drift',
          `페이지에 블록 ${extracted.visibleBlocks}개가 보이는데 카드 셀렉터(${SELECTORS.card})가 0건입니다. 마크업이 바뀌었을 수 있습니다`,
        );
      }

      const items: SocialContent[] = [];
      const rejected: Rejection[] = [];
      for (const card of extracted.cards) {
        const url = canonicalUrl(card.href);
        if (!card.id && !url) {
          rejected.push({ reason: 'data-id와 링크가 모두 없음', sample: truncateSample(card) });
          continue;
        }
        const caption = card.caption ?? '';
        items.push({
          platform: 'web',
          platformContentId: card.id ?? url ?? '',
          url,
          creatorHandle: null,
          caption,
          hashtags: [...caption.matchAll(HASHTAG_PATTERN)].map((m) => (m[1] ?? '').toLowerCase()),
          mediaType: 'unknown',
          publishedAt: now().toISOString(),
          metrics: { views: parseViews(card.viewsText), likes: null, comments: null, shares: null },
        });
      }
      return { items, rejected, warnings: [], nextCursor: null };
    },
  };
}
