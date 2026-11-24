import type { ReactElement } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ComingSoonPage } from '../features/placeholder/ComingSoonPage';
import { AppShell } from './AppShell';
import { navItems } from './navigation';

/** 구현이 끝난 화면. 여기에 없는 메뉴는 준비 중 화면으로 연결된다. */
const implementedPages: Record<string, ReactElement> = {
  '/': <DashboardPage />,
};

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      ...navItems.map((item) => ({
        path: item.path,
        element: implementedPages[item.path] ?? <ComingSoonPage item={item} />,
      })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
