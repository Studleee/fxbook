import type {
  AccountState,
  Algo,
  Order,
  Position,
  Quote,
  TerminalEvent,
} from '../models';
import { candleCountFor, timeframeSeconds, type ChartTimeframe } from '../chart/timeframes';
import { generateCandles } from './candles';
import { positionPnl } from '../format';

const now = Date.now();
const minutes = (n: number) => n * 60_000;
const hours = (n: number) => n * 3_600_000;

export const INITIAL_QUOTES: Record<string, Quote> = {
  'EUR/USD': { bid: 1.08512, ask: 1.08528, spreadPips: 1.6 },
  'USD/CAD': { bid: 1.38402, ask: 1.38418, spreadPips: 1.6 },
  'AUD/CHF': { bid: 0.57182, ask: 0.57204, spreadPips: 2.2 },
  'AUD/JPY': { bid: 97.451, ask: 97.464, spreadPips: 1.3 },
  'AUD/NZD': { bid: 1.09184, ask: 1.09212, spreadPips: 2.8 },
  'EUR/GBP': { bid: 0.84102, ask: 0.84118, spreadPips: 1.6 },
  'EUR/CHF': { bid: 0.94088, ask: 0.94112, spreadPips: 2.4 },
  'GBP/USD': { bid: 1.28974, ask: 1.28996, spreadPips: 2.2 },
  'USD/SGD': { bid: 1.34482, ask: 1.34498, spreadPips: 1.6 },
};

const BASES: Record<string, { base: number; seed: number }> = {
  'EUR/USD': { base: 1.0824, seed: 11 },
  'USD/CAD': { base: 1.3798, seed: 23 },
  'AUD/CHF': { base: 0.5741, seed: 37 },
  'AUD/JPY': { base: 97.12, seed: 41 },
  'AUD/NZD': { base: 1.0892, seed: 53 },
  'EUR/GBP': { base: 0.8388, seed: 67 },
  'EUR/CHF': { base: 0.9432, seed: 71 },
  'GBP/USD': { base: 1.2934, seed: 83 },
  'USD/SGD': { base: 1.3411, seed: 97 },
};

export function buildCandleMap(
  tf: ChartTimeframe = 'M5',
): Record<string, ReturnType<typeof generateCandles>> {
  const map: Record<string, ReturnType<typeof generateCandles>> = {};
  const interval = timeframeSeconds(tf);
  const count = candleCountFor(tf);
  for (const [pair, cfg] of Object.entries(BASES)) {
    const candles = generateCandles(pair, cfg.base, cfg.seed, count, interval);
    const quote = INITIAL_QUOTES[pair];
    const last = candles[candles.length - 1];
    const mid = (quote.bid + quote.ask) / 2;
    last.close = mid;
    last.high = Math.max(last.high, mid);
    last.low = Math.min(last.low, mid);
    map[pair] = candles;
  }
  return map;
}

/** Extend mock M5 history for correlation windows that need deeper lookback. */
export function ensureMockCorrelationCandles(
  pairs: string[],
  m5Count: number,
  existing: Record<string, ReturnType<typeof generateCandles>>,
): Record<string, ReturnType<typeof generateCandles>> {
  const next = { ...existing };
  for (const pair of pairs) {
    if ((next[pair]?.length ?? 0) >= m5Count * 0.9) continue;
    const cfg = BASES[pair];
    if (!cfg) continue;
    const candles = generateCandles(pair, cfg.base, cfg.seed, m5Count, 300);
    const quote = INITIAL_QUOTES[pair];
    if (quote && candles.length) {
      const last = candles[candles.length - 1];
      const mid = (quote.bid + quote.ask) / 2;
      last.close = mid;
      last.high = Math.max(last.high, mid);
      last.low = Math.min(last.low, mid);
    }
    next[pair] = candles;
  }
  return next;
}

const SEED_ALGOS = [
  {
    id: 'eurusd',
    pair: 'EUR/USD',
    strategy: 'MeanRev01',
    status: 'RUNNING',
    signal: 'SHORT',
    health: 'HEALTHY',
    exposureUnits: 100,
    pnlToday: 0.06,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.55,
      profitFactor: 1.42,
      expectancyR: 0.06,
      avgWinR: 0.31,
      avgLossR: -0.19,
      rollingDrawdownPct: -0.8,
      state: 'HEALTHY',
    },
  },
  {
    id: 'usdcad',
    pair: 'USD/CAD',
    strategy: 'Trend01',
    status: 'RUNNING',
    signal: 'LONG',
    health: 'HEALTHY',
    exposureUnits: 200,
    pnlToday: 0.16,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.5,
      profitFactor: 1.38,
      expectancyR: 0.05,
      avgWinR: 0.29,
      avgLossR: -0.18,
      rollingDrawdownPct: -1.1,
      state: 'HEALTHY',
    },
  },
  {
    id: 'audchf',
    pair: 'AUD/CHF',
    strategy: 'Trend01',
    status: 'LOCKED',
    signal: 'NEUTRAL',
    health: 'WATCH',
    exposureUnits: 0,
    pnlToday: -0.08,
    lockReason: 'STOP LOSS',
    cooldownEndsAt: now + hours(6) + minutes(14) + 32_000,
    lastError: null,
    consecutiveLosses: 1,
    metrics: {
      lastN: 20,
      winRate: 0.4,
      profitFactor: 0.92,
      expectancyR: -0.02,
      avgWinR: 0.22,
      avgLossR: -0.21,
      rollingDrawdownPct: -2.4,
      state: 'WATCH',
    },
  },
  {
    id: 'audjpy',
    pair: 'AUD/JPY',
    strategy: 'Trend01',
    status: 'RUNNING',
    signal: 'LONG',
    health: 'HEALTHY',
    exposureUnits: 150,
    pnlToday: 0.22,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.47,
      profitFactor: 1.31,
      expectancyR: 0.03,
      avgWinR: 0.27,
      avgLossR: -0.18,
      rollingDrawdownPct: -1.4,
      state: 'HEALTHY',
    },
  },
  {
    id: 'audnzd',
    pair: 'AUD/NZD',
    strategy: 'Breakout01',
    status: 'RUNNING',
    signal: 'SHORT',
    health: 'WATCH',
    exposureUnits: 120,
    pnlToday: -0.22,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.38,
      profitFactor: 0.84,
      expectancyR: -0.04,
      avgWinR: 0.24,
      avgLossR: -0.22,
      rollingDrawdownPct: -3.1,
      state: 'WATCH',
    },
  },
  {
    id: 'eurgbp',
    pair: 'EUR/GBP',
    strategy: 'MeanRev01',
    status: 'RUNNING',
    signal: 'NEUTRAL',
    health: 'WATCH',
    exposureUnits: 0,
    pnlToday: -0.21,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.42,
      profitFactor: 0.97,
      expectancyR: -0.01,
      avgWinR: 0.2,
      avgLossR: -0.17,
      rollingDrawdownPct: -1.9,
      state: 'WATCH',
    },
  },
  {
    id: 'eurchf',
    pair: 'EUR/CHF',
    strategy: 'Trend01',
    status: 'RUNNING',
    signal: 'NEUTRAL',
    health: 'DEGRADED',
    exposureUnits: 0,
    pnlToday: 0.37,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.52,
      profitFactor: 1.18,
      expectancyR: 0.02,
      avgWinR: 0.25,
      avgLossR: -0.2,
      rollingDrawdownPct: -0.6,
      state: 'DEGRADED',
    },
  },
  {
    id: 'gbpusd',
    pair: 'GBP/USD',
    strategy: 'Trend01',
    status: 'COOLDOWN',
    signal: 'NEUTRAL',
    health: 'HEALTHY',
    exposureUnits: 0,
    pnlToday: -0.27,
    lockReason: 'Max consecutive losses',
    cooldownEndsAt: now + minutes(18) + 44_000,
    lastError: null,
    consecutiveLosses: 3,
    metrics: {
      lastN: 20,
      winRate: 0.48,
      profitFactor: 1.12,
      expectancyR: 0.01,
      avgWinR: 0.26,
      avgLossR: -0.19,
      rollingDrawdownPct: -1.6,
      state: 'HEALTHY',
    },
  },
  {
    id: 'usdsgd',
    pair: 'USD/SGD',
    strategy: 'Flow01',
    status: 'RUNNING',
    signal: 'LONG',
    health: 'HEALTHY',
    exposureUnits: 80,
    pnlToday: 0.58,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    metrics: {
      lastN: 20,
      winRate: 0.58,
      profitFactor: 1.61,
      expectancyR: 0.08,
      avgWinR: 0.33,
      avgLossR: -0.16,
      rollingDrawdownPct: -0.4,
      state: 'HEALTHY',
    },
  },
];

const MODE_BY_ID: Record<string, Partial<Algo>> = {
  usdcad: { managementMode: 'AUTO', exitMode: 'AUTO' },
  audchf: { entryMode: 'OFF', managementMode: 'MANUAL', exitMode: 'MANUAL' },
  audnzd: { entryMode: 'MANUAL', managementMode: 'MANUAL', exitMode: 'MANUAL' },
  eurgbp: { signal: 'LONG', entryQuietUntil: now + 12_000 },
  usdsgd: { exitMode: 'MANUAL' },
};

export const INITIAL_ALGOS: Algo[] = SEED_ALGOS.map((row) => ({
  entryMode: 'AUTO' as const,
  managementMode: 'HYBRID' as const,
  exitMode: 'HYBRID' as const,
  riskArmed: true,
  entryQuietUntil: 0,
  ...row,
  ...MODE_BY_ID[row.id],
})) as Algo[];

function mid(pair: string): number {
  const q = INITIAL_QUOTES[pair];
  return (q.bid + q.ask) / 2;
}

function pos(partial: Omit<Position, 'current' | 'unrealizedPnl'> & { current?: number }): Position {
  const current = partial.current ?? mid(partial.pair);
  return {
    ...partial,
    current,
    unrealizedPnl: positionPnl(partial.pair, partial.side, partial.entry, current, partial.units, INITIAL_QUOTES),
  };
}

export const INITIAL_POSITIONS: Position[] = [
  pos({
    id: 'pos-usdcad',
    pair: 'USD/CAD',
    algoId: 'usdcad',
    strategy: 'Trend01',
    side: 'LONG',
    units: 200,
    entry: 1.3832,
    stop: 1.379,
    trail: null,
    margin: 12.4,
    openedAt: now - hours(2) - minutes(14),
    status: 'ACTIVE',
  }),
  pos({
    id: 'pos-audjpy',
    pair: 'AUD/JPY',
    algoId: 'audjpy',
    strategy: 'Trend01',
    side: 'LONG',
    units: 150,
    entry: 97.412,
    stop: 97.12,
    trail: 97.38,
    margin: 9.8,
    openedAt: now - hours(1) - minutes(7),
    status: 'TRAILING',
  }),
  pos({
    id: 'pos-eurusd',
    pair: 'EUR/USD',
    algoId: 'eurusd',
    strategy: 'MeanRev01',
    side: 'SHORT',
    units: 100,
    entry: 1.0864,
    stop: 1.0892,
    trail: null,
    margin: 6.1,
    openedAt: now - minutes(41),
    status: 'ACTIVE',
  }),
  pos({
    id: 'pos-audnzd',
    pair: 'AUD/NZD',
    algoId: 'audnzd',
    strategy: 'Breakout01',
    side: 'SHORT',
    units: 120,
    entry: 1.0902,
    stop: 1.0948,
    trail: null,
    margin: 7.4,
    openedAt: now - hours(3) - minutes(22),
    status: 'ACTIVE',
  }),
  pos({
    id: 'pos-usdsgd',
    pair: 'USD/SGD',
    algoId: 'usdsgd',
    strategy: 'Flow01',
    side: 'LONG',
    units: 80,
    entry: 1.3431,
    stop: 1.3394,
    trail: 1.3438,
    margin: 4.9,
    openedAt: now - minutes(86),
    status: 'TRAILING',
  }),
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-1',
    pair: 'USD/CAD',
    strategy: 'Trend01',
    type: 'STOP',
    side: 'SHORT',
    units: 200,
    price: 1.379,
    status: 'WORKING',
    createdAt: now - hours(2) - minutes(14),
  },
  {
    id: 'ord-2',
    pair: 'AUD/JPY',
    strategy: 'Trend01',
    type: 'STOP',
    side: 'SHORT',
    units: 150,
    price: 97.38,
    status: 'WORKING',
    createdAt: now - minutes(22),
  },
  {
    id: 'ord-3',
    pair: 'EUR/GBP',
    strategy: 'MeanRev01',
    type: 'LIMIT',
    side: 'LONG',
    units: 100,
    price: 0.8394,
    status: 'WORKING',
    createdAt: now - minutes(9),
  },
];

export const INITIAL_EVENTS: TerminalEvent[] = [
  {
    id: 'ev-1',
    timestamp: now - hours(2) - minutes(14),
    strategy: 'Trend01',
    pair: 'USD/CAD',
    event: 'ENTRY LONG 200 @ 1.38320',
    source: 'USER',
    reason: 'Desk add',
  },
  {
    id: 'ev-2',
    timestamp: now - hours(1) - minutes(7),
    strategy: 'Trend01',
    pair: 'AUD/JPY',
    event: 'ENTRY LONG 150 @ 97.412',
    source: 'USER',
    reason: 'Desk add',
  },
  {
    id: 'ev-3',
    timestamp: now - minutes(48),
    strategy: 'Trend01',
    pair: 'AUD/JPY',
    event: 'TRAILING STOP ACTIVATED',
    source: 'RISK ENGINE',
    reason: 'Profit threshold +30 pips',
  },
  {
    id: 'ev-4',
    timestamp: now - minutes(41),
    strategy: 'MeanRev01',
    pair: 'EUR/USD',
    event: 'ENTRY SHORT 100 @ 1.08640',
    source: 'USER',
    reason: 'Desk add',
  },
  {
    id: 'ev-5',
    timestamp: now - hours(4) - minutes(2),
    strategy: 'Trend01',
    pair: 'AUD/CHF',
    event: 'POSITION CLOSED -$0.08',
    source: 'RISK ENGINE',
    reason: 'Hard stop hit',
  },
  {
    id: 'ev-6',
    timestamp: now - hours(4) - minutes(2),
    strategy: 'Trend01',
    pair: 'AUD/CHF',
    event: 'LOCKOUT STARTED',
    source: 'RISK ENGINE',
    reason: 'STOP LOSS',
  },
  {
    id: 'ev-7',
    timestamp: now - minutes(18),
    strategy: 'Trend01',
    pair: 'GBP/USD',
    event: 'COOLDOWN STARTED',
    source: 'RISK ENGINE',
    reason: 'Max consecutive losses',
  },
];

export const INITIAL_ACCOUNT: AccountState = {
  currency: 'USD',
  balance: 55.41,
  realizedToday: 1.18,
  totalReturnPct: 5.0,
  maxDrawdownPct: -5.6,
  peakEquity: 56.5,
  marginUsedPct: 61,
};
