/**
 * One icon per menu item, so the sidebar still reads when it is collapsed to icons only.
 *
 * Stroke drawings on currentColor, so they inherit the link's colour in both themes and in the
 * active state. They are decorative: every item keeps its real text in the DOM for screen
 * readers, hidden visually when collapsed.
 */

const PATHS: Record<string, string> = {
  home: 'M3.5 10.5 12 3.5l8.5 7M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  daily: 'M4 6.5h16v14H4zM8 3v5M16 3v5M4 11h16M9 15.5l2 2 4-4',
  weekly: 'M4 6.5h16v14H4zM8 3v5M16 3v5M4 11h16M8 15h3M8 18h8',
  tasks: 'M4 6.5h5v5H4zM4 14h5v5H4zM12 8h8M12 11h5M12 16.5h8M12 19.5h5',
  abm: 'M12 21s7-5.1 7-10.2A7 7 0 0 0 5 10.8C5 15.9 12 21 12 21Z M12 13.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
  dashboard: 'M4 19.5h16M7 19.5V11M12 19.5V5.5M17 19.5v-5',
  report: 'M6 3.5h8l4 4V20.5H6zM14 3.5v4.5h4M9 13h6M9 16.5h6',
  people: 'M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16.5 5.2a3.2 3.2 0 0 1 0 6.3M18 14.8c2 .7 3.5 2.5 3.5 5',
  taskAdmin: 'M4 6.5h16M4 12h16M4 17.5h9M17 15.5l2 2 3.5-3.5',
  calendar: 'M4 6.5h16v14H4zM8 3v5M16 3v5M4 11h16M8.5 14.5h2M13.5 14.5h2M8.5 17.5h2',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z',
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg
      className="nav-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.home!} />
    </svg>
  );
}
