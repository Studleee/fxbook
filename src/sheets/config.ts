import { toSlashPair } from './pairs';
import type { PairSetting } from './settings';

const KEY = 'fxbook.sheets.config.v1';

export const SHEET_CONTROL_BUTTONS = [
  { setting: 'lockoutHours', label: 'LOCKOUT', defaultCell: 'D3' },
  { setting: 'takeProfitPips', label: 'TAKE PROFIT', defaultCell: 'D7' },
  { setting: 'stopLossPips', label: 'STOP LOSS', defaultCell: 'D4' },
] as const;

export type SheetControlSetting = (typeof SHEET_CONTROL_BUTTONS)[number]['setting'];

export interface PairSheetConfig {
  spreadsheetUrl: string;
  spreadsheetId: string;
  sheetName: string;
  cells: Partial<Record<PairSetting, string>>;
}

type ConfigStore = Record<string, PairSheetConfig>;

export function parseSpreadsheetId(link: string): string | null {
  const t = link.trim();
  if (!t) return null;
  const fromUrl = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(t)) return t;
  return null;
}

export function isA1Cell(value: string): boolean {
  return /^[A-Za-z]{1,3}[1-9][0-9]{0,3}$/.test(value.trim());
}

export function normalizeCell(value: string): string | null {
  const t = value.trim().toUpperCase();
  return isA1Cell(t) ? t : null;
}

function emptyConfig(): PairSheetConfig {
  return {
    spreadsheetUrl: '',
    spreadsheetId: '',
    sheetName: 'Trade Management',
    cells: Object.fromEntries(SHEET_CONTROL_BUTTONS.map((b) => [b.setting, b.defaultCell])),
  };
}

function loadStore(): ConfigStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConfigStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: ConfigStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function loadPairSheetConfig(pair: string): PairSheetConfig {
  const slash = toSlashPair(pair);
  const stored = loadStore()[slash];
  const base = emptyConfig();
  if (!stored) return base;
  return {
    spreadsheetUrl: stored.spreadsheetUrl ?? '',
    spreadsheetId: stored.spreadsheetId ?? '',
    sheetName: stored.sheetName?.trim() || base.sheetName,
    cells: { ...base.cells, ...stored.cells },
  };
}

export function savePairSheetConfig(pair: string, draft: PairSheetConfig): PairSheetConfig {
  const slash = toSlashPair(pair);
  const cells: PairSheetConfig['cells'] = {};
  for (const btn of SHEET_CONTROL_BUTTONS) {
    const cell = normalizeCell(draft.cells[btn.setting] ?? btn.defaultCell);
    cells[btn.setting] = cell ?? btn.defaultCell;
  }
  const spreadsheetId = parseSpreadsheetId(draft.spreadsheetUrl) ?? draft.spreadsheetId.trim();
  const next: PairSheetConfig = {
    spreadsheetUrl: draft.spreadsheetUrl.trim(),
    spreadsheetId,
    sheetName: draft.sheetName.trim() || 'Trade Management',
    cells,
  };
  const store = loadStore();
  store[slash] = next;
  saveStore(store);
  return next;
}

export function writeOverridesFor(pair: string) {
  const cfg = loadPairSheetConfig(pair);
  return {
    spreadsheetId: cfg.spreadsheetId || undefined,
    sheetName: cfg.sheetName || undefined,
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) throw new Error('Sheets backend returned an empty response');
  return JSON.parse(text) as T;
}

export async function fetchBindings(): Promise<Partial<Record<PairSetting, string>>> {
  const res = await fetch('/api/sheets/bindings');
  try {
    const body = await readJson<{ ok?: boolean; bindings?: Record<string, string> }>(res);
    if (!res.ok || !body.ok || !body.bindings) return {};
    return body.bindings;
  } catch {
    return {};
  }
}

export async function saveBindings(
  cells: Partial<Record<PairSetting, string>>,
): Promise<Partial<Record<PairSetting, string>>> {
  const res = await fetch('/api/sheets/bindings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bindings: cells }),
  });
  const body = await readJson<{ ok?: boolean; bindings?: Record<string, string>; error?: string }>(res);
  if (!res.ok || !body.ok || !body.bindings) {
    throw new Error(body.error || 'Could not save bindings');
  }
  return body.bindings;
}
