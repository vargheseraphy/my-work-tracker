/**
 * The sidebar and page frame. The menu follows the signed-in role (docs/DESIGN.md
 * "Differences from the prototypes"), with live badges for missing days and overdue tasks.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { HomeDto, NotificationsDto } from '@gtm/shared';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { NavIcon } from './NavIcon.jsx';
import {
  applyTheme,
  currentTheme,
  storeNavCollapsed,
  storedNavCollapsed,
  type Theme,
} from '../theme.js';

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
 * Who you are signed in as, and the two things that belong to you rather than to the page:
 * the theme and signing out. Collapsing the sidebar hides the name but keeps the avatar, so
 * the menu is reachable either way.
 */
function UserMenu({
  fullName,
  roleLabel,
  collapsed,
  onSignOut,
}: {
  fullName: string;
  roleLabel: string;
  collapsed: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  // Close on Escape or a click anywhere else, like any other menu.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="me-wrap" ref={wrapRef}>
      {open ? (
        <div className="me-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="me-item"
            onClick={() => {
              const next: Theme = dark ? 'light' : 'dark';
              applyTheme(next);
              setTheme(next);
            }}
          >
            <span aria-hidden="true">{dark ? '\u2600' : '\u263D'}</span>
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="me-item"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <span aria-hidden="true">{'\u21AA'}</span>
            Sign out
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="me"
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? `${fullName}, ${roleLabel}` : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(fullName)}
        </span>
        <span className="who">
          <b>{fullName}</b>
          <span>{roleLabel}</span>
        </span>
      </button>
    </div>
  );
}

interface NavItem {
  label?: string;
  to?: string;
  text?: string;
  icon?: string;
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
  const [collapsed, setCollapsed] = useState(storedNavCollapsed);

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
          { to: '/', text: 'Home', icon: 'home', end: true },
          {
            to: '/daily',
            text: 'Daily log',
            icon: 'daily',
            // Not red: since 0009 an open day blocks nothing, so this is a count, not an alarm.
            ...(missing > 0 ? { badge: `${missing} open`, badgeTone: 'info' as const } : {}),
          },
          { to: '/weekly', text: 'Weekly log', icon: 'weekly' },
          {
            to: '/tasks',
            text: 'My tasks',
            icon: 'tasks',
            ...(overdue > 0 ? { badge: `${overdue} overdue`, badgeTone: 'warn' as const } : {}),
          },
          { to: '/abm', text: 'ABM tracker', icon: 'abm' },
        ]
      : [
          { label: 'Team' },
          { to: '/admin', text: 'Dashboard', icon: 'dashboard', end: true },
          { to: '/report', text: 'Weekly report', icon: 'report' },
          { to: '/people', text: 'People', icon: 'people' },
          ...(user.role === 'admin'
            ? [{ to: '/admin/tasks', text: 'Task management', icon: 'taskAdmin' }]
            : []),
          { to: '/abm', text: 'ABM tracker', icon: 'abm' },
          ...(user.role === 'admin'
            ? [
                { label: 'Setup' },
                { to: '/admin/calendar', text: 'Holidays and leave', icon: 'calendar' },
                { to: '/admin/settings', text: 'Targets and fields', icon: 'settings' },
              ]
            : []),
        ];

  return (
    <div className={`app${collapsed ? ' app-collapsed' : ''}`}>
      <a className="skip" href="#main">
        Skip to the main content
      </a>
      <aside className="sidebar">
        <div className="side-top">
          <Link
            className="brand"
            to={user.role === 'contributor' ? '/' : '/admin'}
            title={collapsed ? 'Repotra' : undefined}
          >
            <Logo />
            <b>Repotra</b>
          </Link>
          <div className="side-top-actions">
            <NotificationBell data={notifications} />
            <button
              type="button"
              className="side-collapse"
              aria-pressed={collapsed}
              title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
              aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
              onClick={() => {
                setCollapsed((was) => {
                  storeNavCollapsed(!was);
                  return !was;
                });
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 5.5h16M4 12h16M4 18.5h16" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          {items.map((item, index) =>
            item.label ? (
              <div className="label" key={`label-${item.label}`}>
                {item.label}
              </div>
            ) : (
              <NavLink
                key={item.to ?? index}
                to={item.to!}
                end={item.end}
                title={collapsed ? item.text : undefined}
              >
                <NavIcon name={item.icon ?? 'home'} />
                {/* Kept in the DOM when collapsed, so the link still has a name. */}
                <span className="nav-text">{item.text}</span>
                {item.badge ? (
                  <span className={`pill ${item.badgeTone ?? 'info'}`}>{item.badge}</span>
                ) : null}
              </NavLink>
            ),
          )}
        </nav>

        <UserMenu
          fullName={user.fullName}
          roleLabel={ROLE_LABEL[user.role] ?? user.role}
          collapsed={collapsed}
          onSignOut={() => {
            void signOut();
          }}
        />
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
