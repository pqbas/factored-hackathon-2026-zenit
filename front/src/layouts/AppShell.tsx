import { Outlet } from 'react-router-dom';

import { NavRail } from '@/components/nav-rail';

// First column: the nav rail that switches between sections. Each section
// renders its own second (list) and third (content) columns via the Outlet.
export default function AppShell() {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
