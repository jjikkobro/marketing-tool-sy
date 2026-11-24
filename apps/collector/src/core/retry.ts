import { CollectorError, toCollectorError } from './errors.ts';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 테스트에서 실제로 기다리지 않도록 주입한다. */
  sleep: (ms: number) => Promise<void>;
  /** 0 이상 1 미만. 테스트에서 지터를 고정하려고 주입한다. */
  random: () => number;
  onRetry?: (error: CollectorError, attempt: number, delayMs: number) => void;
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 지수 백오프 + full jitter.
 * 서버가 Retry-After를 주면 그 값을 우선한다. 여러 수집기가 같은 순간에 다시 몰리지 않게 하려는 것이다.
 */
export function backoffDelay(
  attempt: number,
  error: CollectorError,
  options: RetryOptions,
): number {
  if (error.retryAfterMs !== null) return Math.min(error.retryAfterMs, options.maxDelayMs);
  const ceiling = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(options.random() * ceiling);
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<{ value: T; retries: number }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { value: await operation(attempt), retries: attempt - 1 };
    } catch (raw) {
      const error = toCollectorError(raw);
      if (!error.retryable || attempt >= options.maxAttempts) {
        throw new RetryExhaustedError(error, attempt);
      }
      const delay = backoffDelay(attempt, error, options);
      options.onRetry?.(error, attempt, delay);
      await options.sleep(delay);
    }
  }
}

/** 마지막 오류와 시도 횟수를 함께 남겨, 실행 기록에 "몇 번 시도했는지"를 적을 수 있게 한다. */
export class RetryExhaustedError extends Error {
  readonly last: CollectorError;
  readonly attempts: number;

  constructor(last: CollectorError, attempts: number) {
    super(`${attempts}회 시도 후 실패: ${last.message}`, { cause: last });
    this.name = 'RetryExhaustedError';
    this.last = last;
    this.attempts = attempts;
  }
}
