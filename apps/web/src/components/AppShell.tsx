/**
 * The sidebar and page frame. The menu follows the signed-in role (docs/DESIGN.md
 * "Differences from the prototypes"), with live badges for missing days and overdue tasks.
 */

import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { HomeDto, NotificationsDto } from '@gtm/shared';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NotificationBell } from './NotificationBell.jsx';

/**
 * The Repotra mark: three rising bars, the activity-over-time idea the app is built around.
 * Corners are tight (design/brand-theme) and the fills are tokens, so it follows light and dark.
 */
function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="13" width="5" height="9" rx="1.5" fill="var(--orb-cyan)" />
      <rect x="9.5" y="8" width="5" height="14" rx="1.5" fill="var(--orb-violet)" />
      <rect x="17" y="3" width="5" height="19" rx="1.5" fill="var(--accent)" />
    </svg>
  );
}

interface NavItem {
  label?: string;
  to?: string;
  text?: string;
  badge?: string;
  end?: boolean;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin · GTM lead',
  contributor: 'Contributor',
  viewer: 'Viewer · read only',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  // Badges only mean anything to a contributor, so only they fetch home.
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeDto>('/home'),
    enabled: user?.role === 'contributor',
    staleTime: 30_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsDto>('/notifications'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!user) return null;

  const missing = home?.missingDays.length ?? 0;
  const overdue = home?.openTasks.filter((t) => t.isOverdue).length ?? 0;

  const items: NavItem[] =
    user.role === 'contributor'
      ? [
          { label: 'My work' },
          { to: '/', text: 'Home', end: true },
          {
            to: '/daily',
            text: 'Daily log',
            ...(missing > 0 ? { badge: `${missing} missing` } : {}),
          },
          { to: '/weekly', text: 'Weekly log' },
          {
            to: '/tasks',
            text: 'My tasks',
            ...(overdue > 0 ? { badge: `${overdue} overdue` } : {}),
          },
          { to: '/abm', text: 'ABM tracker' },
        ]
      : [
          { label: 'Team' },
          { to: '/admin', text: 'Dashboard', end: true },
          { to: '/report', text: 'Weekly report' },
          { to: '/people', text: 'People' },
          ...(user.role === 'admin'
            ? [{ to: '/admin/tasks', text: 'Task management' }]
            : []),
          { to: '/abm', text: 'ABM tracker' },
          ...(user.role === 'admin'
            ? [
                { label: 'Setup' },
                { to: '/admin/calendar', text: 'Holidays and leave' },
                { to: '/admin/settings', text: 'Targets and fields' },
              ]
            : []),
        ];

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to the main content
      </a>
      <aside className="sidebar">
        <Link className="brand" to={user.role === 'contributor' ? '/' : '/admin'}>
          <Logo />
          <b>Repotra</b>
        </Link>

        <nav className="nav" aria-label="Main">
          {items.map((item, index) =>
            item.label ? (
              <div className="label" key={`label-${item.label}`}>
                {item.label}
              </div>
            ) : (
              <NavLink key={item.to ?? index} to={item.to!} end={item.end}>
                <span>{item.text}</span>
                {item.badge ? <span className="pill bad">{item.badge}</span> : null}
              </NavLink>
            ),
          )}
        </nav>

        <div className="me">
          <div className="avatar" aria-hidden="true">
            {initials(user.fullName)}
          </div>
          <div className="who">
            <b>{user.fullName}</b>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
        </div>
        <div className="row" style={{ padding: '0 8px', gap: 8 }}>
          <NotificationBell data={notifications} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
