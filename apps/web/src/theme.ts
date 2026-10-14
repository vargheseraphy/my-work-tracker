/**
 * Light or dark, chosen by the person and remembered in this browser.
 *
 * Light is the default. The system setting is deliberately not followed: people were landing in
 * dark without asking for it. Read the stored choice before the first paint (see main.tsx) so
 * the page never flashes light and then redraws dark.
 */

export type Theme = 'light' | 'dark';

const KEY = 'repotra.theme';

/** Storage can throw in a private window or with site data blocked, so never let it escape. */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // A remembered choice is a convenience, not a requirement.
  }
}

/** The theme in force right now, which is what the root element says. */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Run once at start-up, before React renders. */
export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', storedTheme() ?? 'light');
}
