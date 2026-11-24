import { describe, expect, it } from 'vitest';
import { classifyGraphError } from '../src/adapters/instagram-graph.ts';
import { classifyTikTokError } from '../src/adapters/tiktok-research.ts';
import { CollectorError } from '../src/core/errors.ts';
import {
  backoffDelay,
  RetryExhaustedError,
  withRetry,
  type RetryOptions,
} from '../src/core/retry.ts';

function options(overrides: Partial<RetryOptions> = {}): RetryOptions & { waits: number[] } {
  const waits: number[] = [];
  return {
    maxAttempts: 4,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => 0.5,
    ...overrides,
    waits,
  };
}

describe('withRetry', () => {
  it('429는 Retry-After만큼 기다렸다가 다시 시도한다', async () => {
    const opts = options();
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new CollectorError('rate_limited', '429', { retryAfterMs: 3_000 });
      return 'ok';
    }, opts);
    expect(result).toEqual({ value: 'ok', retries: 1 });
    expect(opts.waits).toEqual([3_000]);
  });

  it('401(auth)은 재시도하지 않는다. 쿼터만 낭비하기 때문이다', async () => {
    const opts = options();
    let calls = 0;
    const attempt = withRetry(async () => {
      calls += 1;
      throw new CollectorError('auth', '401');
    }, opts);
    await expect(attempt).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(calls).toBe(1);
    expect(opts.waits).toEqual([]);
  });

  it('5xx가 계속되면 maxAttempts에서 멈추고 마지막 오류와 시도 횟수를 남긴다', async () => {
    const opts = options({ maxAttempts: 3 });
    const attempt = withRetry(async () => {
      throw new CollectorError('server', '503');
    }, opts);
    await expect(attempt).rejects.toMatchObject({ attempts: 3, last: { kind: 'server' } });
    expect(opts.waits).toHaveLength(2);
  });

  it('백오프는 지수적으로 커지되 상한을 넘지 않는다', () => {
    const opts = options({ random: () => 0.999 });
    const error = new CollectorError('server', '503');
    const delays = [1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, error, opts));
    expect(delays.slice(0, 4)).toEqual([499, 999, 1998, 3996]);
    expect(Math.max(...delays)).toBeLessThanOrEqual(8_000);
  });
});

describe('오류 분류', () => {
  it('Graph API는 호출 한도를 429가 아니라 400 + code로 알려준다', () => {
    for (const code of [4, 17, 32, 613]) {
      const error = classifyGraphError(
        400,
        JSON.stringify({ error: { message: 'limit', code } }),
        undefined,
      );
      expect(error.kind).toBe('rate_limited');
      expect(error.retryable).toBe(true);
    }
  });

  it('Graph API code 190은 토큰 만료라 재시도하지 않는다', () => {
    const error = classifyGraphError(
      400,
      JSON.stringify({ error: { message: 'expired', code: 190 } }),
      undefined,
    );
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
  });

  it('오류 본문이 JSON이 아니어도(게이트웨이 HTML) 상태 코드로 분류한다', () => {
    expect(classifyTikTokError(503, '<html>Service Unavailable</html>', undefined).kind).toBe(
      'server',
    );
    expect(classifyGraphError(502, '<html>Bad Gateway</html>', undefined).kind).toBe('server');
  });

  it('TikTok 429의 Retry-After(초)를 ms로 바꿔 담는다', () => {
    const error = classifyTikTokError(429, '{}', '2');
    expect(error.kind).toBe('rate_limited');
    expect(error.retryAfterMs).toBe(2_000);
  });
});
