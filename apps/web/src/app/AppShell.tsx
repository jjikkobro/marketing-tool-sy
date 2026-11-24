import { Outlet } from 'react-router';
import { GithubFab } from '../components/layout/GithubFab';
import { PortfolioNotice } from '../components/layout/PortfolioNotice';
import { Sidebar } from '../components/layout/Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col">
      <PortfolioNotice />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto px-10 pt-10 pb-28">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <GithubFab />
    </div>
  );
}
