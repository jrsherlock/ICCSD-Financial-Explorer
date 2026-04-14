import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-56 p-6 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
