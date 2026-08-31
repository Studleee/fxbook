const KEY = 'fxbook.theme.v1';

export const DESK_THEMES = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'slate', label: 'Slate' },
  { id: 'carbon', label: 'Carbon' },
  { id: 'amber', label: 'Amber' },
] as const;

export type DeskThemeId = (typeof DESK_THEMES)[number]['id'];

export const DEFAULT_THEME: DeskThemeId = 'midnight';

export function isDeskTheme(value: string): value is DeskThemeId {
  return DESK_THEMES.some((theme) => theme.id === value);
}

export function applyDeskTheme(id: DeskThemeId): void {
  document.documentElement.dataset.theme = id;
}

export function loadDeskTheme(): DeskThemeId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && isDeskTheme(raw)) return raw;
  } catch {
    /* private mode */
  }
  return DEFAULT_THEME;
}

export function saveDeskTheme(id: DeskThemeId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
}

export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartTheme() {
  return {
    bg: cssVar('--bg-0', '#070809'),
    text: cssVar('--text-dim', '#8b95a1'),
    grid: cssVar('--bg-3', '#15191f'),
    line: cssVar('--line', '#232a33'),
    green: cssVar('--green', '#3ecf8e'),
    greenDim: cssVar('--green-dim', '#1f7a54'),
    red: cssVar('--red', '#ef5b67'),
    redDim: cssVar('--red-dim', '#8d2e38'),
    blue: cssVar('--blue', '#5b9fd4'),
    mute: cssVar('--text-mute', '#5f6a74'),
    pane: cssVar('--bg-4', '#1b2027'),
  };
}

applyDeskTheme(loadDeskTheme());
