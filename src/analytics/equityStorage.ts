import type { EquitySnapshot } from './types';
import type { EquityHistoryMeta } from './equityHistory';
import { DEFAULT_EQUITY_SYNC_DAYS } from './equityHistory';

const KEY = 'fxbook.equityHistory.v1';

export interface StoredEquityHistory {
  accountKey: string;
  snapshots: EquitySnapshot[];
  lastOandaSyncAt: number | null;
  lastCsvImportAt: number | null;
  lastCsvFileName: string | null;
  oandaSyncDays: number;
}

export function equityAccountKey(accountId?: string | null): string {
  const trimmed = accountId?.trim();
  return trimmed ? `oanda:${trimmed}` : 'local';
}

export function loadEquityHistory(accountKey: string): StoredEquityHistory | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEquityHistory;
    if (!parsed || parsed.accountKey !== accountKey || !Array.isArray(parsed.snapshots)) return null;
    return {
      accountKey: parsed.accountKey,
      snapshots: parsed.snapshots,
      lastOandaSyncAt: parsed.lastOandaSyncAt ?? null,
      lastCsvImportAt: parsed.lastCsvImportAt ?? null,
      lastCsvFileName: parsed.lastCsvFileName ?? null,
      oandaSyncDays: parsed.oandaSyncDays ?? DEFAULT_EQUITY_SYNC_DAYS,
    };
  } catch {
    return null;
  }
}

export function saveEquityHistory(data: StoredEquityHistory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota */
  }
}

export function storedMeta(data: StoredEquityHistory | null): Partial<EquityHistoryMeta> {
  if (!data) return {};
  return {
    lastOandaSyncAt: data.lastOandaSyncAt,
    lastCsvImportAt: data.lastCsvImportAt,
    lastCsvFileName: data.lastCsvFileName,
    oandaSyncDays: data.oandaSyncDays,
  };
}
