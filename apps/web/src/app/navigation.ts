import {
  Activity,
  BookText,
  Bot,
  CalendarDays,
  Images,
  LayoutDashboard,
  type LucideIcon,
  PenLine,
  Radar,
  Settings,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** 원본 툴의 어떤 기능을 재구성했는지. 준비 중 화면과 README에서 쓴다. */
  origin: string;
  summary: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/*
 * 메뉴 순서는 데이터 흐름을 따른다: 수집 → 분석 → 기획·제작 → 관리.
 * 원본은 상단 가로 메뉴 11개였는데, 사이드바 그룹으로 묶어 흐름이 한눈에 보이게 했다.
 * 우선순위 근거는 STATUS.md의 "기능 우선순위"를 본다.
 */
export const navigation: NavGroup[] = [
  {
    label: '수집 · 분석',
    items: [
      {
        path: '/',
        label: '성과 대시보드',
        icon: LayoutDashboard,
        origin: '대시보드 (SNS 콘텐츠 추적, 채널·전환 현황, 주간 보고서)',
        summary:
          '채널별 게시물 성과를 자동 수집하고, D+3·D+7 기준으로 판정해 개선 방향을 제안합니다.',
      },
      {
        path: '/discovery',
        label: '소셜 콘텐츠 수집',
        icon: Radar,
        origin: 'SNS 소재 찾기, 공개 인스타그램 수집기, 채용공고 수집기',
        summary:
          '주제에 맞는 키워드와 계정을 찾아 TikTok·Instagram 콘텐츠를 수집하고, 점수와 위험도를 매겨 추천합니다.',
      },
      {
        path: '/operations',
        label: '수집 운영 모니터',
        icon: Activity,
        origin: '설정 > 실행 로그, 스케줄러, 지표 동기화 기록',
        summary:
          '수집 실행마다 실패·누락·중복 건수를 기록하고, 플랫폼 변화로 생긴 오류를 찾아 재시도합니다.',
      },
      {
        path: '/agent',
        label: 'AI 에이전트 연결',
        icon: Bot,
        origin: '신규 (원본의 수집·분석 기능을 MCP 도구로 공개)',
        summary:
          '수집한 콘텐츠와 성과 데이터를 MCP 도구로 열어, AI와 대화하며 콘텐츠를 찾고 분석할 수 있게 합니다.',
      },
    ],
  },
  {
    label: '기획 · 제작',
    items: [
      {
        path: '/writer',
        label: '브랜드 콘텐츠 작성기',
        icon: PenLine,
        origin: '서비스 블로그 작성기, 채용공고 블로그 작성기',
        summary:
          '제품과 타깃을 입력하면 레시피·제품 소개·브랜드 스토리 등 여러 편의 원고를 한 번에 만듭니다.',
      },
      {
        path: '/sns',
        label: 'SNS 콘텐츠 제작',
        icon: Images,
        origin: 'SNS 자동화 (카드뉴스 렌더링, 채널별 문안 생성)',
        summary: '원고를 카드뉴스 이미지와 인스타그램·쇼츠·스레드 등 채널별 문안으로 바꿉니다.',
      },
      {
        path: '/calendar',
        label: '발행 캘린더',
        icon: CalendarDays,
        origin: '발행 캘린더',
        summary: '브랜드·채널별 발행 일정과 준비 상태를 날짜 단위로 관리합니다.',
      },
    ],
  },
  {
    label: '관리',
    items: [
      {
        path: '/prompts',
        label: '프롬프트 라이브러리',
        icon: BookText,
        origin: '블로그 프롬프트, 설정 > 프롬프트',
        summary: '콘텐츠 유형별 생성 지침을 버전으로 관리하고 결과를 비교합니다.',
      },
      {
        path: '/settings',
        label: '설정',
        icon: Settings,
        origin: '설정 (브랜드 수치, 원본 파일, 스케줄)',
        summary: '브랜드 기준 정보와 자동화 스케줄을 관리합니다.',
      },
    ],
  },
];

export const navItems: NavItem[] = navigation.flatMap((group) => group.items);
