/**
 * 레퍼런스 기반 기획의 키 없는 대체 계획자.
 *
 * Claude를 쓸 수 없을 때(키 없음, 예산 초과, 호출 실패) 마케터가 고른 레퍼런스의 포맷을 규칙으로 분류해
 * 템플릿 기획안을 만든다. 새 내용을 지어내지 않고, 숫자를 쓰지 않으며, 같은 가드를 거친다.
 */
import { classifyFormat, FORMAT_LABEL, type FormatId } from '../core/format.ts';
import type { Db } from '../db/database.ts';
import type { ProposalDraft } from '../schema.ts';
import { factById } from './observation.ts';
import type { Planner } from './planners.ts';

function referenceFormat(db: Db, factId: string): FormatId | null {
  const [type, platform = '', ...rest] = factId.split(':');
  const contentId = rest.join(':');
  if (type !== 'content' && type !== 'video') return null;
  const row = db
    .prepare('SELECT caption, hashtags FROM content WHERE platform = ? AND platform_content_id = ?')
    .get(platform, contentId) as { caption: string; hashtags: string } | undefined;
  return row ? classifyFormat(row.caption, JSON.parse(row.hashtags) as string[]) : null;
}

export function referenceTemplatePlanner(db: Db): Planner {
  return {
    id: 'template:references',
    async propose(observation) {
      const focus = observation.focusReferences ?? [];
      const counts = new Map<FormatId, number>();
      for (const id of focus) {
        const format = referenceFormat(db, id);
        // 포맷 집계(format:*)가 있는 포맷만 근거로 쓸 수 있다
        if (format && factById(db, `format:${format}`)) {
          counts.set(format, (counts.get(format) ?? 0) + 1);
        }
      }
      const format = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
      const label = FORMAT_LABEL[format];
      const brief: ProposalDraft = {
        kind: 'content_brief',
        title: `고른 레퍼런스 기반 ${label} 숏폼 기획`,
        rationale: `마케터가 고른 레퍼런스의 구성을 바탕으로 한 ${label} 포맷 기획 가설입니다. 레퍼런스의 첫 장면과 전개 방식을 우리 제품 상황에 맞게 바꿉니다. 키 없이 규칙으로 만든 템플릿 기획안입니다.`,
        adapterId: null,
        queryKind: null,
        queryValue: null,
        runId: null,
        evidence: [`format:${format}`, ...focus],
        claims: [],
        plan: {
          format,
          hook: `레퍼런스처럼 첫 장면에서 바로 ${label} 상황을 보여주고 시청자에게 질문을 던진다`,
          deliverable: '세로형 숏폼 한 편과 캡션',
          successCriteria: '채택 후 D+7에 저장·공유·댓글 반응을 같은 계정의 최근 게시물과 비교한다',
          brandRisk: '과도한 섭취나 위험한 도전을 부추기지 않는다',
        },
      };
      return [brief];
    },
  };
}
