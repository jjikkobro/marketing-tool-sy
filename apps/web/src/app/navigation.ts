import { Activity, Bot, ClipboardCheck, Compass, type LucideIcon, Radar } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/*
 * 화면은 개요(무엇·왜·어떻게) 다음에 데이터 흐름 순서로 둔다: 수집 → 운영 점검 → 에이전트 제안 검토 → AI 연결.
 * 원본 툴의 작성기·카드뉴스·캘린더 화면은 지원 직무와 거리가 멀어 옮기지 않았다 (docs/decisions/0001).
 */
export const navigation: NavGroup[] = [
  {
    label: '시작',
    items: [{ path: '/', label: '개요 · 직접 해보기', icon: Compass }],
  },
  {
    label: '수집',
    items: [
      { path: '/discovery', label: '소셜 콘텐츠 수집', icon: Radar },
      { path: '/operations', label: '수집 운영 모니터', icon: Activity },
    ],
  },
  {
    label: '에이전트',
    items: [
      { path: '/proposals', label: '제안 검토', icon: ClipboardCheck },
      { path: '/agent', label: 'MCP 연결', icon: Bot },
    ],
  },
];
