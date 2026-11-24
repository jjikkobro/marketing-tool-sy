/**
 * 공개 데모의 Claude 호출 예산.
 *
 * 누구나 링크를 열 수 있으므로 비용과 남용을 묶어 둔다.
 * - 하루 전체 호출 상한 (UTC 자정 초기화)
 * - 방문자(세션)당 호출 상한
 * - 동시에 진행 중인 호출 수 상한
 * 한도를 넘으면 호출하지 않고, 녹화 응답으로 대체한 이유를 화면에 그대로 보여준다.
 */
export interface BudgetOptions {
  dailyLimit: number;
  perSessionLimit: number;
  maxConcurrent: number;
  now?: () => Date;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: string };

export class ClaudeBudget {
  private day = '';
  private usedToday = 0;
  private inFlight = 0;
  private readonly options: Required<BudgetOptions>;

  constructor(options: BudgetOptions) {
    this.options = { now: () => new Date(), ...options };
  }

  private rollDay() {
    const today = this.options.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.usedToday = 0;
    }
  }

  status(sessionPlansUsed: number) {
    this.rollDay();
    return {
      remainingToday: Math.max(0, this.options.dailyLimit - this.usedToday),
      remainingForSession: Math.max(0, this.options.perSessionLimit - sessionPlansUsed),
    };
  }

  /** 호출 가능하면 자리를 잡는다. 끝나면 반드시 release()를 부른다. */
  acquire(sessionPlansUsed: number): BudgetDecision {
    this.rollDay();
    if (sessionPlansUsed >= this.options.perSessionLimit) {
      return {
        allowed: false,
        reason: `이 방문자의 실시간 호출 ${this.options.perSessionLimit}회를 모두 썼습니다`,
      };
    }
    if (this.usedToday >= this.options.dailyLimit) {
      return {
        allowed: false,
        reason: `오늘의 실시간 호출 한도(${this.options.dailyLimit}회)에 도달했습니다`,
      };
    }
    if (this.inFlight >= this.options.maxConcurrent) {
      return {
        allowed: false,
        reason: '다른 방문자의 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요',
      };
    }
    this.usedToday += 1;
    this.inFlight += 1;
    return { allowed: true };
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }
}
