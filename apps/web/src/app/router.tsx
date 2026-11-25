import { createBrowserRouter, Navigate } from 'react-router';
import { ActionsPage } from '../features/admin/ActionsPage';
import { SettingsPage } from '../features/admin/SettingsPage';
import { AgentPage } from '../features/agent/AgentPage';
import { DraftsPage } from '../features/drafts/DraftsPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { PlanningPage } from '../features/planning/PlanningPage';
import { ReferencesPage } from '../features/references/ReferencesPage';
import { AppShell } from './AppShell';

export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: '/', element: <OverviewPage /> },
        { path: '/references', element: <ReferencesPage /> },
        { path: '/planning', element: <PlanningPage /> },
        { path: '/drafts', element: <DraftsPage /> },
        { path: '/admin/actions', element: <ActionsPage /> },
        { path: '/operations', element: <OperationsPage /> },
        { path: '/admin/settings', element: <SettingsPage /> },
        { path: '/agent', element: <AgentPage /> },
        // 예전 주소(README·공유 링크)를 새 화면으로 보낸다
        { path: '/discovery', element: <Navigate to="/references" replace /> },
        { path: '/proposals', element: <Navigate to="/planning" replace /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    // 하위 경로 배포(GitHub Pages)에서도 라우팅이 맞도록 Vite base를 그대로 쓴다
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
);
