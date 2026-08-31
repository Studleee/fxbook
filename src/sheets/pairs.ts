import { DESK_PAIRS } from '../services/oanda/format';

/** Desk pairs are the source of truth. Add extras here only when a sheet exists before the pair is on the book. */
export const EXTRA_SHEET_PAIRS = [] as const;

export const SHEET_PAIRS = [...DESK_PAIRS, ...EXTRA_SHEET_PAIRS] as const;

export type DeskPair = (typeof SHEET_PAIRS)[number];

/** AUD/CHF → AUD_CHF */
export function toPairKey(pair: string): string {
  return pair.trim().replace(/[/-]/g, '_').toUpperCase();
}

/** AUD_CHF → AUD/CHF */
export function fromPairKey(key: string): string {
  const k = key.trim().toUpperCase();
  if (k.length === 6 && !k.includes('_')) return `${k.slice(0, 3)}/${k.slice(3)}`;
  return k.replace('_', '/');
}

export function isKnownPair(pair: string): boolean {
  const slash = pair.includes('/') ? pair : fromPairKey(pair);
  return (SHEET_PAIRS as readonly string[]).includes(slash);
}

export function toSlashPair(pair: string): string {
  return pair.includes('/') ? pair : fromPairKey(pair);
}
