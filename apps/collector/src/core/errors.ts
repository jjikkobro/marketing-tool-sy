import type { ErrorKind } from '../schema.ts';

/** 재시도해서 나아질 수 있는 오류만 true. 401에 재시도하면 쿼터만 낭비한다. */
const RETRYABLE: ReadonlySet<ErrorKind> = new Set(['rate_limited', 'server', 'network']);

export class CollectorError extends Error {
  readonly kind: ErrorKind;
  readonly httpStatus: number | null;
  /** 서버가 Retry-After로 알려준 대기 시간 */
  readonly retryAfterMs: number | null;

  constructor(
    kind: ErrorKind,
    message: string,
    options: { httpStatus?: number | null; retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'CollectorError';
    this.kind = kind;
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

export function toCollectorError(error: unknown): CollectorError {
  if (error instanceof CollectorError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CollectorError('unknown', message, { cause: error });
}
