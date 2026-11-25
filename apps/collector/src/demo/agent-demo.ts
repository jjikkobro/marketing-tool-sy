/**
 * 에이전트 데모: 녹화된 계획 응답으로 제안을 만들고 가드를 통과시킨다.
 * 웹 화면에서 승인 이후 상태도 보이도록 데모 검토자가 두 가지만 결정한다.
 * - 첫 수집 제안을 승인해 실행한다 (레퍼런스 수집 화면의 "승인 → 실행 결과" 연결)
 * - 첫 기획안을 채택하고 템플릿 초안을 하나 만든다 (초안 발행 화면이 비지 않도록). 발행은 사람이 한다.
 * 나머지 통과 제안은 사람이 결정하도록 pending으로 남긴다.
 */
import { createDraft, templateDrafter } from '../agent/drafts.ts';
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
  const brief = submitted.find(
    (s) => s.proposal?.status === 'pending' && s.proposal.kind === 'content_brief',
  );
  if (brief?.proposal) {
    await approve(db, brief.proposal.id, {
      reviewer: DEMO_REVIEWER,
      note: '데모: 초안 단계를 보여주기 위한 예시 채택',
      now,
      adapterFor: demoAdapterFactory(now),
    });
    await createDraft(db, brief.proposal.id, templateDrafter(), now);
  }
  return submitted;
}
