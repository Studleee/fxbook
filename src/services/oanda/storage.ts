const KEY = 'fxbook.oanda.v1';

export interface StoredOanda {
  environment: 'PAPER' | 'LIVE';
  token: string;
  accountId: string;
}

export function loadOandaSettings(): StoredOanda | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredOanda;
  } catch {
    return null;
  }
}

export function saveOandaSettings(settings: StoredOanda): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function clearOandaSettings(): void {
  localStorage.removeItem(KEY);
}

export function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return t ? '••••' : '';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
