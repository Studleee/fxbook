import type { ClosedTrade, EquitySnapshot, PairPerformanceRow, PairPerformanceStatus, TradeMetricsSummary } from './types';
import {
  calculateDrawdownFromEquity,
  calculateExpectancy,
  calculateExpectancyR,
  calculatePayoffRatio,
  calculateProfitFactor,
  calculateSQN,
  calculateSharpe,
  calculateSortino,
  calculateWinRate,
} from './metrics';
import { mean, sum } from './math';

export function pairPerformanceStatus(row: {
  profitFactor: number | null;
  expectancy: number | null;
  winRate: number | null;
  pnl: number;
}): PairPerformanceStatus {
  if (row.profitFactor != null && row.profitFactor >= 1.5 && (row.expectancy ?? 0) > 0) return 'STRONG';
  if (row.pnl < 0 && row.profitFactor != null && row.profitFactor < 1) return 'WEAK';
  if ((row.winRate ?? 100) < 42 || (row.profitFactor ?? 2) < 1.1) return 'WATCH';
  return 'NORMAL';
}

export function summarizeTrades(trades: ClosedTrade[], equitySnapshots: EquitySnapshot[]): TradeMetricsSummary {
  if (!trades.length) {
    return {
      totalTrades: 0,
      winRate: null,
      netPnL: 0,
      profitFactor: null,
      expectancy: null,
      expectancyUsd: null,
      avgWinner: null,
      avgLoser: null,
      payoffRatio: null,
      avgPips: null,
      avgUsd: null,
      maxDrawdownPct: calculateDrawdownFromEquity(equitySnapshots),
      sharpe: null,
      sortino: null,
      sqn: null,
      avgHoldMs: null,
      hasData: false,
    };
  }

  const wins = trades.filter((t) => t.realizedPnL > 0);
  const losses = trades.filter((t) => t.realizedPnL < 0);

  return {
    totalTrades: trades.length,
    winRate: calculateWinRate(trades),
    netPnL: sum(trades.map((t) => t.realizedPnL)),
    profitFactor: calculateProfitFactor(trades),
    expectancy: calculateExpectancy(trades),
    expectancyUsd: calculateExpectancy(trades),
    avgWinner: mean(wins.map((t) => t.realizedPnL)),
    avgLoser: mean(losses.map((t) => t.realizedPnL)),
    payoffRatio: calculatePayoffRatio(trades),
    avgPips: mean(trades.map((t) => t.pips)),
    avgUsd: mean(trades.map((t) => t.realizedPnL)),
    maxDrawdownPct: calculateDrawdownFromEquity(equitySnapshots),
    sharpe: calculateSharpe(trades),
    sortino: calculateSortino(trades),
    sqn: calculateSQN(trades),
    avgHoldMs: mean(trades.map((t) => t.holdDurationMs)),
    hasData: true,
  };
}

export function pairLeaderboard(trades: ClosedTrade[]): PairPerformanceRow[] {
  const byPair = new Map<string, ClosedTrade[]>();
  for (const t of trades) {
    const list = byPair.get(t.pair) ?? [];
    list.push(t);
    byPair.set(t.pair, list);
  }

  return [...byPair.entries()]
    .map(([pair, list]) => {
      const pnl = sum(list.map((t) => t.realizedPnL));
      const pips = sum(list.map((t) => t.pips));
      const row = {
        pair,
        trades: list.length,
        pnl,
        pips,
        winRate: calculateWinRate(list),
        profitFactor: calculateProfitFactor(list),
        expectancy: calculateExpectancyR(list) ?? calculateExpectancy(list),
        avgWin: mean(list.filter((t) => t.realizedPnL > 0).map((t) => t.realizedPnL)),
        avgLoss: mean(list.filter((t) => t.realizedPnL < 0).map((t) => t.realizedPnL)),
        maxDrawdownPct: null,
        avgHoldMs: mean(list.map((t) => t.holdDurationMs)),
        status: 'NORMAL' as PairPerformanceStatus,
      };
      return { ...row, status: pairPerformanceStatus(row) };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

export function longShortSplit(trades: ClosedTrade[]): {
  long: TradeMetricsSummary;
  short: TradeMetricsSummary;
} {
  const long = trades.filter((t) => t.direction === 'LONG');
  const short = trades.filter((t) => t.direction === 'SHORT');
  return {
    long: summarizeTrades(long, []),
    short: summarizeTrades(short, []),
  };
}
