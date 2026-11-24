import type { GuardCheck, Proposal } from '@studio/collector/schema';
import type { BadgeTone } from '../../components/ui/Badge';

export const proposalStatusMeta: Record<Proposal['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: '검토 대기', tone: 'brand' },
  blocked: { label: '가드 차단', tone: 'critical' },
  approved: { label: '승인됨', tone: 'neutral' },
  executed: { label: '실행 완료', tone: 'positive' },
  failed: { label: '실행 실패', tone: 'critical' },
  rejected: { label: '거절', tone: 'muted' },
  acknowledged: { label: '확인함', tone: 'muted' },
};

export const proposalKindLabel: Record<Proposal['kind'], string> = {
  collect_query: '새 수집',
  retry_run: '재실행',
  operator_action: '운영 조치',
};

export const guardCheckLabel: Record<GuardCheck['check'], string> = {
  schema: '형식',
  evidence: '근거 존재',
  claims: '수치 대조',
  grounded_numbers: '문장 속 숫자',
  capability: '실행 가능',
  duplicate: '중복',
  quota: 'API 쿼터',
};

export type ProposalFilter = 'pending' | 'blocked' | 'decided' | 'all';

export const filterLabel: Record<ProposalFilter, string> = {
  pending: '검토 대기',
  blocked: '가드 차단',
  decided: '결정됨',
  all: '전체',
};

export function matchesFilter(proposal: Proposal, filter: ProposalFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'decided') return proposal.status !== 'pending' && proposal.status !== 'blocked';
  return proposal.status === filter;
}
