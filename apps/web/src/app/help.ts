/**
 * 화면별 도움말. 짧은 단계로 쓰고, 각 단계는 화면의 한 영역(data-help 값)을 가리킨다.
 * 단계를 누르면 HelpPanel이 그 영역으로 스크롤하고 잠시 강조한다.
 *
 * 쓰는 법: 한 단계는 "무엇을 한다" 한 문장 + 필요하면 한 문장. 기능 설명보다 행동을 쓴다.
 */
export interface HelpStep {
  title: string;
  body: string;
  /** 강조할 영역의 data-help 값 */
  target: string;
  /** 접힌 영역이면 펼친다 (aria-expanded="false"인 버튼을 누른다) */
  expand?: boolean;
  /**
   * 강조하기 전에 화면에서 실제로 해 보는 동작. click을 누르고(unless가 이미 있으면 건너뜀),
   * 화면이 바뀐 뒤 target을 강조한다. 예: 첫 레퍼런스를 체크해 "기획안 만들기" 바를 띄운다
   */
  demo?: { click: string; unless?: string };
}

export interface PageHelp {
  title: string;
  summary: string;
  steps: HelpStep[];
}

export const helpByPath: Record<string, PageHelp> = {
  '/': {
    title: '처음이라면',
    summary:
      '숏폼 레퍼런스를 모아 AI 기획안과 초안으로 만드는 툴입니다. 결정은 항상 사람이 합니다.',
    steps: [
      { title: '무엇을 하는 툴인가', body: '첫 문단만 읽으면 됩니다.', target: 'overview-hero' },
      {
        title: '다섯 단계 흐름',
        body: '주황 칸이 사람이 결정하는 단계입니다.',
        target: 'overview-flow',
      },
      {
        title: '직접 해보기',
        body: '세 단계를 순서대로 눌러 보세요. 내 브라우저 전용이라 마음껏 눌러도 됩니다.',
        target: 'overview-try',
      },
      {
        title: '무엇이 실제인가',
        body: '초록 점은 실시간, 주황 점은 녹화·꺼짐입니다.',
        target: 'live-status',
      },
      {
        title: '워크플로 메뉴',
        body: '1 수집 → 2 기획 → 3 초안 순서로 일합니다. 숫자는 처리할 건수입니다.',
        target: 'nav-workflow',
      },
    ],
  },
  '/references': {
    title: '1단계 · 레퍼런스 수집',
    summary: '참고할 숏폼을 모으고, 마음에 드는 것을 골라 기획으로 넘깁니다.',
    steps: [
      {
        title: '수집 상태 보기',
        body: '실패·경고가 있으면 "실패 원인 보기"로 이유를 확인합니다.',
        target: 'run-summary',
      },
      {
        title: '포맷·해시태그로 좁히기',
        body: '해시태그를 누르면 표가 그 태그로 좁혀집니다.',
        target: 'reference-filters',
      },
      {
        title: '레퍼런스 고르기',
        body: '표에서 최대 다섯 개를 체크합니다. —는 수집하지 못한 값(0이 아님)입니다.',
        target: 'reference-table',
      },
      {
        title: '이 레퍼런스로 기획안 만들기',
        body: '맨 위 레퍼런스를 체크해 보여드립니다. 화면 아래 바의 버튼을 누르면 2단계 콘텐츠 기획으로 이어집니다.',
        target: 'reference-selection',
        demo: {
          click: '[data-help="reference-table"] tbody tr:first-child input[type="checkbox"]',
          unless: '[data-help="reference-table"] input[type="checkbox"]:checked',
        },
      },
      {
        title: '더 모으기',
        body: '펼쳐서 AI 제안을 받고, 승인하면 바로 수집되어 표에 "새로 수집"으로 들어옵니다.',
        target: 'collect-proposals',
        expand: true,
      },
    ],
  },
  '/planning': {
    title: '2단계 · 콘텐츠 기획',
    summary: 'AI가 쓴 기획안 중 쓸 것을 고릅니다. 검증기를 통과한 것만 검토 대기에 옵니다.',
    steps: [
      {
        title: 'AI에게 기획안 받기',
        body: '20~40초 걸립니다. 기획안·수집 제안·운영 조치가 각 화면으로 나뉘어 갑니다.',
        target: 'plan-panel',
      },
      {
        title: '검토자 이름 쓰기',
        body: '채택·거절에 이름이 기록됩니다. 비어 있으면 버튼이 눌리지 않습니다.',
        target: 'brief-tabs',
      },
      {
        title: '근거 확인하기',
        body: '근거·수치는 DB 값과 대조된 것입니다. "원본 영상 보기"는 새 탭에서 열립니다.',
        target: 'brief-list',
      },
      {
        title: '채택 또는 거절',
        body: '채택하면 3단계 초안 발행으로 넘어갑니다. 거절 사유는 다음 AI 제안에 반영됩니다.',
        target: 'brief-list',
      },
      {
        title: '근거가 된 포맷',
        body: '기획안의 숫자는 이 집계와 같아야 통과합니다.',
        target: 'format-basis',
      },
    ],
  },
  '/drafts': {
    title: '3단계 · 초안 발행',
    summary: '채택한 기획안을 대본·캡션으로 만들고, 고쳐서 최종본으로 확정합니다.',
    steps: [
      {
        title: 'AI 초안 만들기',
        body: '채택한 기획안마다 버튼이 있습니다. 10~30초 걸립니다.',
        target: 'adopted-briefs',
      },
      {
        title: '고치기',
        body: '제목·대본·캡션·해시태그를 바로 고칠 수 있습니다. 고친 내용도 숫자 검사를 다시 거칩니다.',
        target: 'draft-list',
      },
      {
        title: '발행 확정',
        body: '최종본으로 기록합니다. 실제 SNS에는 게시하지 않습니다.',
        target: 'draft-list',
      },
      {
        title: '확정본 가져가기',
        body: '"발행 확정" 탭에서 캡션·해시태그를 복사합니다.',
        target: 'draft-tabs',
      },
    ],
  },
  '/admin/actions': {
    title: 'Admin · 운영 조치',
    summary: '에이전트가 대신할 수 없어 사람이 직접 해야 하는 일입니다.',
    steps: [
      {
        title: '확인 필요한 조치',
        body: '토큰 갱신·파서 점검 같은 일입니다. 처리했으면 "확인함"을 누릅니다.',
        target: 'action-tabs',
      },
      {
        title: '가드 차단 기록',
        body: '검증기가 무엇을 왜 막았는지 모아 봅니다.',
        target: 'action-list',
      },
    ],
  },
  '/operations': {
    title: 'Admin · 수집 운영 모니터',
    summary: '수집이 조용히 실패하지 않도록 실행마다 기록합니다.',
    steps: [
      {
        title: '수집 경로별 상태',
        body: '경로마다 성공·부분 실패·실패와 오류 종류를 봅니다.',
        target: 'adapter-health',
      },
      {
        title: '실행 기록',
        body: '행을 펼치면 재시도·누락·구조 변화의 원인이 나옵니다.',
        target: 'run-table',
      },
    ],
  },
  '/admin/settings': {
    title: 'Admin · 에이전트 설정',
    summary: 'AI가 기획안·초안을 쓸 때 따르는 지침을 고칩니다. 내 샌드박스에만 적용됩니다.',
    steps: [
      {
        title: '먼저 읽기',
        body: '근거·숫자 규칙은 고정이라 지침으로 풀 수 없습니다.',
        target: 'settings-notice',
      },
      {
        title: '기획 지침 고치기',
        body: '톤·타깃·형식을 적고 저장하면 다음 AI 호출부터 반영됩니다.',
        target: 'config-brief_guidelines',
      },
      {
        title: '초안 지침 고치기',
        body: '대본·캡션의 형식을 정합니다. 숫자는 말로 적으세요.',
        target: 'config-draft_guidelines',
      },
    ],
  },
  '/agent': {
    title: 'Admin · MCP 연결',
    summary:
      'Claude Code 같은 AI 도구가 같은 데이터를 조회·제안하게 연결합니다. 승인 도구는 없습니다.',
    steps: [
      { title: '연결하기', body: '명령 한 줄로 연결합니다.', target: 'mcp-connect' },
      {
        title: '쓸 수 있는 도구',
        body: '조회·관찰·제안만 있습니다. 승인은 사람이 웹에서 합니다.',
        target: 'mcp-tools',
      },
    ],
  },
};
