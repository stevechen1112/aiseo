'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Bot,
  Search, 
  FileText, 
  Activity,
  BarChart3, 
  FileDown,
  Settings,
  Link as LinkIcon,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

function resolveDashboardBase(pathname: string) {
  const match = pathname.match(/^\/tenant\/([^/]+)\/dashboard(\/.*)?$/);
  if (match) {
    const tenantId = match[1];
    return { base: `/tenant/${tenantId}/dashboard`, tenantId };
  }
  return { base: '/dashboard', tenantId: null as string | null };
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { base, tenantId: tenantIdFromPath } = resolveDashboardBase(pathname);

  useEffect(() => {
    if (!user?.tenantId) return;
    if (!pathname.startsWith('/dashboard')) return;

    const rest = pathname.slice('/dashboard'.length);
    router.replace(`/tenant/${encodeURIComponent(user.tenantId)}/dashboard${rest}`);
  }, [pathname, user?.tenantId]);

  useEffect(() => {
    if (!tenantIdFromPath) return;
    if (!user?.tenantId) return;
    if (tenantIdFromPath === user.tenantId) return;
    router.replace(`/tenant/${encodeURIComponent(user.tenantId)}/dashboard`);
  }, [tenantIdFromPath, user?.tenantId]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
            AI
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white">AISEO</span>
        </div>
        
        <nav className="flex flex-col gap-1 p-4">
          <NavItem href={base} icon={<LayoutDashboard className="h-5 w-5" />} label="Overview" active={pathname === base} />
          <NavItem href={`${base}/agents`} icon={<Bot className="h-5 w-5" />} label="Agents" active={pathname.startsWith(`${base}/agents`)} />
          <NavItem href={`${base}/keywords`} icon={<Search className="h-5 w-5" />} label="Keywords" active={pathname.startsWith(`${base}/keywords`)} />
          <NavItem href={`${base}/content`} icon={<FileText className="h-5 w-5" />} label="Content" active={pathname.startsWith(`${base}/content`)} />
          <NavItem href={`${base}/audit`} icon={<Activity className="h-5 w-5" />} label="Audit" active={pathname.startsWith(`${base}/audit`)} />
          <NavItem href={`${base}/rankings`} icon={<BarChart3 className="h-5 w-5" />} label="Rankings" active={pathname.startsWith(`${base}/rankings`)} />
          <NavItem href={`${base}/backlinks`} icon={<LinkIcon className="h-5 w-5" />} label="Backlinks" active={pathname.startsWith(`${base}/backlinks`)} />
          <NavItem href={`${base}/reports`} icon={<FileDown className="h-5 w-5" />} label="Reports" active={pathname.startsWith(`${base}/reports`)} />
          
          <div className="my-4 border-t border-gray-200 dark:border-gray-700" />
          
          <NavItem href={`${base}/settings`} icon={<Settings className="h-5 w-5" />} label="Settings" active={pathname.startsWith(`${base}/settings`)} />
        </nav>

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <User className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.email || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Admin
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6">
          <div className="flex flex-1 items-center justify-between">
            <div>
              {/* Breadcrumb or page title can go here */}
            </div>
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  active = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
