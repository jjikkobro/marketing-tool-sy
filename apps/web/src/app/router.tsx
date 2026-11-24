import { createBrowserRouter, Navigate } from 'react-router';
import { AgentPage } from '../features/agent/AgentPage';
import { DiscoveryPage } from '../features/discovery/DiscoveryPage';
import { OperationsPage } from '../features/operations/OperationsPage';
import { AppShell } from './AppShell';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DiscoveryPage /> },
      { path: '/operations', element: <OperationsPage /> },
      { path: '/agent', element: <AgentPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
