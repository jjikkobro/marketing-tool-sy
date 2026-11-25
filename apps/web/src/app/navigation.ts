import {
  Activity,
  Bot,
  Compass,
  Lightbulb,
  type LucideIcon,
  Radar,
  Send,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import type { WorkCounts } from '../features/workflow/counts';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** 워크플로 단계 번호 (사이드바와 단계 표시에 보인다) */
  step?: number;
  /** 사람이 처리할 건수를 붙일 항목 */
  countKey?: keyof WorkCounts;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** bottom이면 사이드바 맨 아래에 둔다 (Admin) */
  placement?: 'bottom';
}

/*
 * 마케터의 일 순서대로 둔다: 레퍼런스 수집 → 콘텐츠 기획 → 초안 발행.
 * 운영 조치·수집 모니터·프롬프트 설정·MCP는 마케터의 흐름과 섞이지 않게 맨 아래 Admin으로 뺐다.
 * (한 화면에 수집 제안·기획안·운영 조치가 섞여 헷갈린다는 피드백, 2026-11-25)
 */
export const workflowSteps: NavItem[] = [
  { path: '/references', label: '레퍼런스 수집', icon: Radar, step: 1, countKey: 'references' },
  { path: '/planning', label: '콘텐츠 기획', icon: Lightbulb, step: 2, countKey: 'planning' },
  { path: '/drafts', label: '초안 발행', icon: Send, step: 3, countKey: 'drafts' },
];

export const navigation: NavGroup[] = [
  {
    label: '시작',
    items: [{ path: '/', label: '개요 · 직접 해보기', icon: Compass }],
  },
  { label: '워크플로', items: workflowSteps },
  {
    label: 'Admin',
    placement: 'bottom',
    items: [
      { path: '/admin/actions', label: '운영 조치', icon: Wrench, countKey: 'actions' },
      { path: '/operations', label: '수집 운영 모니터', icon: Activity },
      { path: '/admin/settings', label: '에이전트 설정', icon: SlidersHorizontal },
      { path: '/agent', label: 'MCP 연결', icon: Bot },
    ],
  },
];
