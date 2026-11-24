import { createBrowserRouter, Navigate } from 'react-router';
import { AgentPage } from '../features/agent/AgentPage';
import { DiscoveryPage } from '../features/discovery/DiscoveryPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { ProposalsPage } from '../features/proposals/ProposalsPage';
import { AppShell } from './AppShell';

export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: '/', element: <OverviewPage /> },
        { path: '/discovery', element: <DiscoveryPage /> },
        { path: '/operations', element: <OperationsPage /> },
        { path: '/proposals', element: <ProposalsPage /> },
        { path: '/agent', element: <AgentPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    // 하위 경로 배포(GitHub Pages)에서도 라우팅이 맞도록 Vite base를 그대로 쓴다
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
);
