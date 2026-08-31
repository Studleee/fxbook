import type { Candle } from '../models';
import type { ClosedTrade, RegimePerformanceRow, TradingSession, TrendRegime, VolatilityRegime } from './types';
import {
  calculateExpectancy,
  calculateExpectancyR,
  calculateProfitFactor,
  calculateWinRate,
} from './metrics';
import { mean, stdDev } from './math';

/** UTC session buckets for entry time. */
export function tradingSessionFromTimestamp(ts: number): TradingSession {
  const h = new Date(ts).getUTCHours();
  if (h >= 0 && h < 8) return 'ASIA';
  if (h >= 8 && h < 16) return 'LONDON';
  return 'NEW YORK';
}

/** Rolling close-to-close volatility percentile vs recent history. */
export function volatilityRegimeFromCandles(candles: Candle[]): VolatilityRegime {
  if (candles.length < 20) return 'NORMAL';
  const closes = candles.slice(-40).map((c) => c.close);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const sd = stdDev(rets);
  if (sd == null) return 'NORMAL';
  if (sd < 0.00035) return 'LOW';
  if (sd > 0.0012) return 'HIGH';
  return 'NORMAL';
}

/** Simple MA slope proxy for trend state (first version — documented). */
export function trendRegimeFromCandles(candles: Candle[]): TrendRegime {
  if (candles.length < 30) return 'RANGING';
  const closes = candles.slice(-30).map((c) => c.close);
  const m = mean(closes);
  if (m == null || m === 0) return 'RANGING';
  const slope = (closes[closes.length - 1] - closes[0]) / closes.length;
  const slopePct = Math.abs(slope / m);
  return slopePct > 0.0008 ? 'TRENDING' : 'RANGING';
}

function aggregateRegime(trades: ClosedTrade[], keyFn: (t: ClosedTrade) => string): RegimePerformanceRow[] {
  const groups = new Map<string, ClosedTrade[]>();
  for (const t of trades) {
    const k = keyFn(t);
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }
  return [...groups.entries()].map(([regime, list]) => ({
    regime,
    trades: list.length,
    expectancy: calculateExpectancy(list),
    expectancyR: calculateExpectancyR(list),
    profitFactor: calculateProfitFactor(list),
    winRate: calculateWinRate(list),
  }));
}

export function sessionPerformance(trades: ClosedTrade[]): RegimePerformanceRow[] {
  return aggregateRegime(trades, (t) => tradingSessionFromTimestamp(t.entryTime));
}

export function segmentPerformance(
  _trades: ClosedTrade[],
  segments: Record<string, ClosedTrade[]>,
): RegimePerformanceRow[] {
  return Object.entries(segments).map(([regime, list]) => ({
    regime,
    trades: list.length,
    expectancy: calculateExpectancy(list),
    expectancyR: calculateExpectancyR(list),
    profitFactor: calculateProfitFactor(list),
    winRate: calculateWinRate(list),
  }));
}
