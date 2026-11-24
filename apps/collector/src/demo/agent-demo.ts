/**
 * 에이전트 데모: 녹화된 계획 응답으로 제안을 만들고 가드를 통과시킨다.
 * 웹 화면에서 승인 이후 상태(실행 완료)도 보이도록, 첫 제안 하나만 데모 검토자가 승인한다.
 * 나머지 통과 제안은 사람이 결정하도록 pending으로 남긴다.
 */
import { recordedPlanner } from '../agent/planners.ts';
import { approve, planAndGuard } from '../agent/review.ts';
import type { Db } from '../db/database.ts';
import { demoAdapterFactory } from './agent-adapters.ts';

export const DEMO_REVIEWER = 'demo-reviewer';

export async function runAgentDemo(db: Db, now: Date = new Date()) {
  const submitted = await planAndGuard(db, recordedPlanner(), now);
  const first = submitted.find(
    (s) => s.proposal?.status === 'pending' && s.proposal.kind === 'collect_query',
  );
  if (first?.proposal) {
    await approve(db, first.proposal.id, {
      reviewer: DEMO_REVIEWER,
      note: '데모: 승인 이후 흐름을 보여주기 위한 예시 승인',
      now,
      adapterFor: demoAdapterFactory(now),
      runOptions: { retry: { sleep: async () => {}, random: () => 0.5 } },
    });
  }
  return submitted;
}
