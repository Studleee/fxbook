import type { ClosedTrade, EquitySnapshot } from './types';
import { downsideStdDev, finiteOrNull, mean, stdDev, sum } from './math';

export function calculateProfitFactor(trades: ClosedTrade[]): number | null {
  const wins = trades.filter((t) => t.realizedPnL > 0).map((t) => t.realizedPnL);
  const losses = trades.filter((t) => t.realizedPnL < 0).map((t) => t.realizedPnL);
  const grossProfit = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  if (grossLoss === 0) return wins.length ? null : null;
  if (grossProfit === 0 && grossLoss > 0) return 0;
  return finiteOrNull(grossProfit / grossLoss);
}

export function calculateExpectancy(trades: ClosedTrade[]): number | null {
  if (!trades.length) return null;
  return finiteOrNull(mean(trades.map((t) => t.realizedPnL)) ?? NaN);
}

export function calculateExpectancyR(trades: ClosedTrade[]): number | null {
  const withR = trades.filter((t) => t.rMultiple != null) as Array<ClosedTrade & { rMultiple: number }>;
  if (!withR.length) return null;
  return finiteOrNull(mean(withR.map((t) => t.rMultiple)) ?? NaN);
}

export function calculatePayoffRatio(trades: ClosedTrade[]): number | null {
  const wins = trades.filter((t) => t.realizedPnL > 0);
  const losses = trades.filter((t) => t.realizedPnL < 0);
  const avgWin = mean(wins.map((t) => t.realizedPnL));
  const avgLoss = mean(losses.map((t) => t.realizedPnL));
  if (avgWin == null || avgLoss == null || avgLoss === 0) return null;
  return finiteOrNull(avgWin / Math.abs(avgLoss));
}

export function calculateWinRate(trades: ClosedTrade[]): number | null {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.realizedPnL > 0).length;
  return finiteOrNull((wins / trades.length) * 100);
}

/**
 * Sharpe on per-trade realized P&L (USD), not annualized.
 * Documented: uses trade-level returns; annualization requires trade frequency data.
 */
export function calculateSharpe(trades: ClosedTrade[]): number | null {
  const rets = trades.map((t) => t.realizedPnL);
  if (rets.length < 3) return null;
  const m = mean(rets);
  const sd = stdDev(rets);
  if (m == null || sd == null || sd === 0) return null;
  return finiteOrNull(m / sd);
}

/** Sortino on per-trade P&L vs 0 target. */
export function calculateSortino(trades: ClosedTrade[]): number | null {
  const rets = trades.map((t) => t.realizedPnL);
  if (rets.length < 3) return null;
  const m = mean(rets);
  const dd = downsideStdDev(rets, 0);
  if (m == null || dd == null || dd === 0) return null;
  return finiteOrNull(m / dd);
}

/**
 * System Quality Number: sqrt(N) * mean(R) / stdDev(R).
 * R-multiples required; returns null when unavailable.
 */
export function calculateSQN(trades: ClosedTrade[]): number | null {
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null);
  if (rs.length < 5) return null;
  const m = mean(rs);
  const sd = stdDev(rs);
  if (m == null || sd == null || sd === 0) return null;
  return finiteOrNull((Math.sqrt(rs.length) * m) / sd);
}

export function calculateDrawdownFromEquity(snapshots: EquitySnapshot[]): number | null {
  if (!snapshots.length) return null;
  let peak = snapshots[0].equity;
  let maxDd = 0;
  for (const s of snapshots) {
    peak = Math.max(peak, s.equity);
    if (peak > 0) {
      const dd = ((s.equity - peak) / peak) * 100;
      maxDd = Math.min(maxDd, dd);
    }
  }
  return finiteOrNull(maxDd);
}

export function calculateDrawdownSeries(snapshots: EquitySnapshot[]): { time: number; dd: number }[] {
  let peak = 0;
  return snapshots.map((s) => {
    peak = Math.max(peak, s.equity);
    const dd = peak > 0 ? ((s.equity - peak) / peak) * 100 : 0;
    return { time: s.timestamp, dd };
  });
}
