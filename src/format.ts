import { DEFAULT_TIMEZONE_IANA, DEFAULT_TIMEZONE_LABEL } from './chart/timezones';
import {
  buildUsdConversionRates,
  calculatePositionFxMetrics,
  getPipSize,
} from './fx/pips';
import type { Quote, Side } from './models';
let activeTimeZone = DEFAULT_TIMEZONE_IANA;
let activeOffsetLabel = DEFAULT_TIMEZONE_LABEL;

export function setActiveTimeZone(timeZone: string, label = DEFAULT_TIMEZONE_LABEL): void {
  activeTimeZone = timeZone || DEFAULT_TIMEZONE_IANA;
  activeOffsetLabel = label || DEFAULT_TIMEZONE_LABEL;
}

export function isJpyPair(pair: string): boolean {
  return pair.includes('JPY');
}

export function priceDecimals(pair: string): number {
  return isJpyPair(pair) ? 3 : 5;
}

export function pipSize(pair: string): number {
  return getPipSize(pair);
}
export function formatPrice(pair: string, value: number): string {
  return value.toFixed(priceDecimals(pair));
}

export function formatMoney(value: number, digits = 2): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+$${abs}`;
  if (value < 0) return `-$${abs}`;
  return `$${abs}`;
}

export function formatMoneyPlain(value: number, digits = 2, currency = 'USD'): string {
  const abs = Math.abs(value).toFixed(digits);
  if (currency === 'USD') return `$${abs}`;
  return `${abs} ${currency}`;
}

export function formatPct(value: number, digits = 1): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `${abs}%`;
}

export function pnlClass(value: number): string {
  if (value > 0) return 'pos';
  if (value < 0) return 'neg';
  return 'flat';
}

export function formatSpread(pips: number): string {
  return `${pips.toFixed(1)} pip${Math.abs(pips) === 1 ? '' : 's'}`;
}

export function formatSignedPips(pips: number): string {
  const abs = Math.abs(pips).toFixed(1);
  if (pips > 0) return `+${abs}`;
  if (pips < 0) return `−${abs}`;
  return abs;
}

export function formatAge(openedAt: number, now = Date.now()): string {
  const ms = Math.max(0, now - openedAt);
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatClock(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: activeTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: activeTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export function formatChartTime(
  time: number | { year: number; month: number; day: number },
  timeZone = activeTimeZone,
  tickType?: number,
): string {
  const date =
    typeof time === 'number'
      ? new Date(time * 1000)
      : new Date(Date.UTC(time.year, time.month - 1, time.day));
  if (tickType === 0) {
    return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date);
  }
  if (tickType === 1) {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', year: '2-digit' }).format(date);
  }
  if (tickType === 2) {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatCountdown(endsAt: number, now = Date.now()): string {
  const ms = Math.max(0, endsAt - now);
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function formatUnits(units: number): string {
  return Math.round(units).toLocaleString('en-US');
}

export function nextEligible(endsAt: number): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: activeTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(endsAt));
  return `${time} ${activeOffsetLabel}`;
}

export function positionPnl(
  pair: string,
  side: Side,
  entry: number,
  current: number,
  units: number,
  quotes?: Record<string, Quote>,
): number {
  const conversionRates = quotes ? buildUsdConversionRates(quotes) : undefined;
  const { estimatedPnlUSD } = calculatePositionFxMetrics({
    pair,
    side,
    units,
    entryPrice: entry,
    currentPrice: current,
    conversionRates,
  });
  return Number.isFinite(estimatedPnlUSD) ? estimatedPnlUSD : 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
