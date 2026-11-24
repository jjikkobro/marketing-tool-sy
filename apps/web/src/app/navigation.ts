import { Activity, Bot, type LucideIcon, Radar } from 'lucide-react';

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
 * 화면은 데이터 흐름 순서로 세 개만 둔다: 수집 → 운영 점검 → AI 연결.
 * 원본 툴의 작성기·카드뉴스·캘린더 화면은 지원 직무와 거리가 멀어 옮기지 않았다 (docs/decisions/0001).
 */
export const navigation: NavGroup[] = [
  {
    label: '수집',
    items: [
      { path: '/', label: '소셜 콘텐츠 수집', icon: Radar },
      { path: '/operations', label: '수집 운영 모니터', icon: Activity },
    ],
  },
  {
    label: '연결',
    items: [{ path: '/agent', label: 'AI 에이전트 연결', icon: Bot }],
  },
];
