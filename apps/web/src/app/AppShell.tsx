import { Outlet, useLocation } from 'react-router';
import { HelpPanel } from '../components/help/HelpPanel';
import { GithubFab } from '../components/layout/GithubFab';
import { PortfolioNotice } from '../components/layout/PortfolioNotice';
import { Sidebar } from '../components/layout/Sidebar';

export function AppShell() {
  // 화면마다 도움말 상태(선택한 단계)를 새로 시작한다
  const { pathname } = useLocation();
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
        <HelpPanel key={pathname} />
      </div>
      <GithubFab />
    </div>
  );
}
