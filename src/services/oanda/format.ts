export const DESK_PAIRS = [
  'EUR/USD',
  'USD/CAD',
  'AUD/CHF',
  'AUD/JPY',
  'AUD/NZD',
  'EUR/GBP',
  'EUR/CHF',
  'GBP/USD',
  'USD/SGD',
] as const;

export function pricingPairsFor(positions: readonly { pair: string }[]): string[] {
  const pairs = new Set<string>(DESK_PAIRS);
  for (const p of positions) pairs.add(p.pair);
  return [...pairs];
}

export function toInstrument(pair: string): string {
  return pair.replace('/', '_');
}

export function fromInstrument(instrument: string): string {
  return instrument.replace('_', '/');
}

export function parseOandaTime(value: string | number): number {
  if (typeof value === 'number') return Math.floor(value);
  const trimmed = value.replace(/\.\d+Z$/, 'Z').replace(/\.\d+$/, '');
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

export function num(value: string | number | undefined | null): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
