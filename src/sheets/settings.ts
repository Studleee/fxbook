/** Semantic control names. Cell addresses live in server/sheets_py/bindings.py — one map for every pair. */
export const PAIR_SETTINGS = [
  'lockoutHours',
  'stopLossPips',
  'takeProfitPips',
  'trailingStartPips',
  'trailingDistancePips',
  'tradingEnabled',
  'maxPositionSize',
  'closePosition',
  'closePair',
  'manualBuy',
  'manualSell',
] as const;

export type PairSetting = (typeof PAIR_SETTINGS)[number];

export function isPairSetting(value: string): value is PairSetting {
  return (PAIR_SETTINGS as readonly string[]).includes(value);
}

export const LOCKOUT_HOURS_MIN = 0;
export const LOCKOUT_HOURS_MAX = 168;
export const SHEET_PIPS_MIN = 0;
export const SHEET_PIPS_MAX = 999;
