/**
 * The sidebar and page frame. The menu follows the signed-in role (docs/DESIGN.md
 * "Differences from the prototypes"), with live badges for missing days and overdue tasks.
 */

import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { HomeDto, NotificationsDto } from '@gtm/shared';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { applyTheme, currentTheme, type Theme } from '../theme.js';

/**
 * The Repotra mark: a growth line climbing to an arrow, the activity-over-time idea the app is
 * built around. Strokes are tokens, so it follows light and dark.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 16.8 9.5 10.3 13.5 14.3 21 6.8V20H3Z" fill="var(--orb-violet)" opacity=".28" />
      <path
        d="M3 16.8 9.5 10.3 13.5 14.3 21 6.8"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.6 6.8H21v5.4"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Light or dark, remembered in this browser. It carries a word as well as an icon, so the state
 * is never signalled by shape alone.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-pressed={dark}
      title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
      }}
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}

interface NavItem {
  label?: string;
  to?: string;
  text?: string;
  badge?: string;
  /** Neutral unless the thing genuinely needs attention. Nothing routine is red. */
  badgeTone?: 'info' | 'warn' | 'bad';
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
            // Not red: since 0009 an open day blocks nothing, so this is a count, not an alarm.
            ...(missing > 0 ? { badge: `${missing} open`, badgeTone: 'info' as const } : {}),
          },
          { to: '/weekly', text: 'Weekly log' },
          {
            to: '/tasks',
            text: 'My tasks',
            ...(overdue > 0 ? { badge: `${overdue} overdue`, badgeTone: 'warn' as const } : {}),
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
                {item.badge ? (
                  <span className={`pill ${item.badgeTone ?? 'info'}`}>{item.badge}</span>
                ) : null}
              </NavLink>
            ),
          )}
        </nav>

        {/* Actions sit above the divider; who you are signed in as reads last. */}
        <div className="side-actions row">
          <NotificationBell data={notifications} />
          <ThemeToggle />
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

        <div className="me">
          <div className="avatar" aria-hidden="true">
            {initials(user.fullName)}
          </div>
          <div className="who">
            <b>{user.fullName}</b>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
        </div>
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
