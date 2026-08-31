import type { EquitySnapshot } from './types';
import { finiteOrNull } from './math';

type EquitySnapshotSource = NonNullable<EquitySnapshot['source']>;

export const DEFAULT_EQUITY_SYNC_DAYS = 14;
export const MAX_STORED_EQUITY_SNAPSHOTS = 3000;

export interface EquityHistoryMeta {
  source: 'none' | 'live' | 'oanda' | 'csv' | 'mixed';
  lastOandaSyncAt: number | null;
  lastCsvImportAt: number | null;
  lastCsvFileName: string | null;
  oandaSyncDays: number;
  message: string | null;
}

export interface OandaTransactionLike {
  id?: string;
  time?: string;
  type?: string;
  accountBalance?: string;
  balance?: string;
  pl?: string;
}

export interface CsvEquityRow {
  timestamp: number;
  balance: number;
}

function snapshotBucket(timestamp: number): number {
  return Math.floor(timestamp / 60_000);
}

/** Merge equity series; newer point wins within the same minute bucket. */
export function mergeEquitySnapshots(
  existing: EquitySnapshot[],
  incoming: EquitySnapshot[],
): EquitySnapshot[] {
  const map = new Map<number, EquitySnapshot>();
  for (const snap of [...existing, ...incoming]) {
    const key = snapshotBucket(snap.timestamp);
    const prev = map.get(key);
    if (!prev || snap.timestamp >= prev.timestamp) map.set(key, snap);
  }
  return applyDrawdownToSnapshots([...map.values()].sort((a, b) => a.timestamp - b.timestamp)).slice(
    -MAX_STORED_EQUITY_SNAPSHOTS,
  );
}

export function applyDrawdownToSnapshots(snapshots: EquitySnapshot[]): EquitySnapshot[] {
  let peak = 0;
  return snapshots.map((snap) => {
    peak = Math.max(peak, snap.equity);
    const drawdownPct =
      peak > 0 ? finiteOrNull(((snap.equity - peak) / peak) * 100) ?? 0 : 0;
    return { ...snap, drawdownPct };
  });
}

export function downsampleEquitySnapshots(
  snapshots: EquitySnapshot[],
  maxPoints = 1500,
): EquitySnapshot[] {
  if (snapshots.length <= maxPoints) return snapshots;
  const step = Math.ceil(snapshots.length / maxPoints);
  const out: EquitySnapshot[] = [];
  for (let i = 0; i < snapshots.length; i += step) out.push(snapshots[i]);
  const last = snapshots[snapshots.length - 1];
  if (out[out.length - 1]?.timestamp !== last.timestamp) out.push(last);
  return out;
}

export function equitySnapshotFromBalance(args: {
  timestamp: number;
  balance: number;
  source: EquitySnapshotSource;
}): EquitySnapshot {
  return {
    timestamp: args.timestamp,
    balance: args.balance,
    equity: args.balance,
    unrealizedPnL: 0,
    marginUsed: 0,
    availableMargin: args.balance,
    openPositions: 0,
    drawdownPct: 0,
    source: args.source,
  };
}

/** Build balance/equity points from OANDA transaction objects (post-transaction balance). */
export function snapshotsFromOandaTransactions(
  transactions: OandaTransactionLike[],
  source: EquitySnapshotSource = 'oanda',
): EquitySnapshot[] {
  const points: EquitySnapshot[] = [];
  for (const txn of transactions) {
    const rawBalance = txn.accountBalance ?? txn.balance;
    const balance = rawBalance != null ? Number.parseFloat(rawBalance) : NaN;
    const time = txn.time ? Date.parse(txn.time) : NaN;
    if (!Number.isFinite(balance) || !Number.isFinite(time)) continue;
    points.push(equitySnapshotFromBalance({ timestamp: time, balance, source }));
  }
  return applyDrawdownToSnapshots(
    points.sort((a, b) => a.timestamp - b.timestamp),
  );
}

export function deriveEquityHistoryMeta(
  snapshots: EquitySnapshot[],
  patch: Partial<EquityHistoryMeta> = {},
): EquityHistoryMeta {
  const sources = new Set(
    snapshots.map((s) => s.source).filter((s): s is EquitySnapshotSource => Boolean(s)),
  );
  let source: EquityHistoryMeta['source'] = 'none';
  if (sources.size > 1) source = 'mixed';
  else if (sources.has('oanda')) source = 'oanda';
  else if (sources.has('csv')) source = 'csv';
  else if (sources.has('live')) source = 'live';

  return {
    source,
    lastOandaSyncAt: patch.lastOandaSyncAt ?? null,
    lastCsvImportAt: patch.lastCsvImportAt ?? null,
    lastCsvFileName: patch.lastCsvFileName ?? null,
    oandaSyncDays: patch.oandaSyncDays ?? DEFAULT_EQUITY_SYNC_DAYS,
    message: patch.message ?? null,
  };
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Minimal RFC4180-style CSV parser. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\r') continue;
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function pickColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseFlexibleDate(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const direct = Date.parse(trimmed);
  if (Number.isFinite(direct)) return direct;
  const normalized = trimmed.replace(/\s+UTC.*$/i, '').replace(/\s+[A-Z]{2,5}$/i, '');
  return Date.parse(normalized);
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '').replace(/[()]/g, '');
  if (!cleaned || cleaned === '—' || cleaned === '-') return NaN;
  const negative = cleaned.startsWith('-') || (value.includes('(') && value.includes(')'));
  const num = Number.parseFloat(cleaned.replace(/^-/, ''));
  if (!Number.isFinite(num)) return NaN;
  return negative ? -num : num;
}

/** Parse OANDA HUB / transaction-history CSV exports into balance points. */
export function parseTransactionCsv(text: string): { rows: CsvEquityRow[]; error?: string } {
  const table = parseCsvRows(text);
  if (table.length < 2) {
    return { rows: [], error: 'CSV is empty or missing data rows.' };
  }

  const headers = table[0].map(normalizeHeader);
  const dateIdx = pickColumn(headers, [
    'transaction_date',
    'date',
    'time',
    'datetime',
    'transaction_time',
    'ticket_date',
  ]);
  const balanceIdx = pickColumn(headers, [
    'balance',
    'account_balance',
    'ending_balance',
    'accountbalance',
    'closing_balance',
  ]);
  const plIdx = pickColumn(headers, ['pl', 'p_l', 'profit_loss', 'profit', 'amount', 'realized_pl']);

  if (dateIdx < 0) {
    return {
      rows: [],
      error: 'Could not find a date column (expected TRANSACTION DATE, Date, or Time).',
    };
  }

  const parsed: CsvEquityRow[] = [];
  if (balanceIdx >= 0) {
    for (let i = 1; i < table.length; i++) {
      const line = table[i];
      const timestamp = parseFlexibleDate(line[dateIdx] ?? '');
      const balance = parseMoney(line[balanceIdx] ?? '');
      if (!Number.isFinite(timestamp) || !Number.isFinite(balance)) continue;
      parsed.push({ timestamp, balance });
    }
  } else if (plIdx >= 0) {
    let running: number | null = null;
    for (let i = 1; i < table.length; i++) {
      const line = table[i];
      const timestamp = parseFlexibleDate(line[dateIdx] ?? '');
      const pl = parseMoney(line[plIdx] ?? '');
      if (!Number.isFinite(timestamp) || !Number.isFinite(pl)) continue;
      running = running == null ? pl : running + pl;
      parsed.push({ timestamp, balance: running });
    }
    if (parsed.length) {
      return {
        rows: parsed,
        error:
          'No BALANCE column found — built a relative P&L curve from PL/AMOUNT only (not absolute account equity).',
      };
    }
  } else {
    return {
      rows: [],
      error: 'Could not find BALANCE or PL/AMOUNT columns in CSV.',
    };
  }

  if (!parsed.length) {
    return { rows: [], error: 'No usable balance rows found in CSV.' };
  }

  parsed.sort((a, b) => a.timestamp - b.timestamp);
  return { rows: parsed };
}

export function snapshotsFromCsvRows(rows: CsvEquityRow[]): EquitySnapshot[] {
  return applyDrawdownToSnapshots(
    rows.map((row) =>
      equitySnapshotFromBalance({
        timestamp: row.timestamp,
        balance: row.balance,
        source: 'csv',
      }),
    ),
  );
}

export function importTransactionCsv(text: string): {
  snapshots: EquitySnapshot[];
  error?: string;
  warning?: string;
} {
  const parsed = parseTransactionCsv(text);
  if (!parsed.rows.length) {
    return { snapshots: [], error: parsed.error ?? 'No rows parsed.' };
  }
  return {
    snapshots: snapshotsFromCsvRows(parsed.rows),
    warning: parsed.error,
  };
}
