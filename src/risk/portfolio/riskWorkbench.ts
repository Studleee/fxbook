import type {
  CurrencyCapacityRow,
  BookMetrics,
  CalculateBookMetricsArgs,
} from './bookMetrics';
import { calculateBookMetrics } from './bookMetrics';
import { calculateRiskSnapshot } from '../factor/riskSnapshot';
import { volatilityMap } from './volatility';
import type { RiskDataQuality, RiskWorkbenchResult } from './types';

export type { BookMetrics, CurrencyCapacityRow, CalculateBookMetricsArgs };

export function calculateRiskWorkbench(
  args: CalculateBookMetricsArgs & {
    nowMs?: number;
    candlesByPair?: Record<string, import('../../models').Candle[]>;
    balance?: number;
    riskBudgetVaR?: number | null;
  },
): RiskWorkbenchResult {
  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  const metrics = calculateBookMetrics(args);
  const pairs = [...new Set(args.positions.map((p) => p.pair))];
  const candles = args.candlesByPair ?? {};

  const volMap = volatilityMap(pairs, candles, nowSec);
  const pairsWithVol = pairs.filter((p) => volMap[p]?.volatility != null).length;

  const snapshot =
    Object.keys(candles).length > 0
      ? calculateRiskSnapshot({
          positions: args.positions,
          quotes: args.quotes,
          candlesByPair: candles,
          equity: args.equity,
          balance: args.balance,
          accountCurrency: args.accountCurrency,
          riskBudgetVaR: args.riskBudgetVaR,
          shockPercent: args.shockPercent,
          maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
          nowMs: args.nowMs,
        })
      : null;

  const notes: string[] = [];
  if (metrics.bookSummary.grossExposure == null && args.positions.length > 0) {
    notes.push('Some positions lack account-currency notional conversion.');
  }
  if (snapshot && !snapshot.dataComplete) {
    notes.push('Factor covariance: insufficient historical observations.');
  }

  const dataQuality: RiskDataQuality = {
    pairsTotal: pairs.length,
    pairsWithVol,
    correlationObservations: snapshot?.covarianceMetadata?.observations ?? 0,
    partialModel:
      (metrics.bookSummary.grossExposure == null && args.positions.length > 0) ||
      (snapshot != null && !snapshot.dataComplete),
    lastUpdated: nowSec * 1000,
    notes,
  };

  return {
    accountCurrency: metrics.accountCurrency,
    equity: metrics.equity,
    shockPercent: metrics.shockPercent,
    maxCurrencyShockRiskPct: metrics.maxCurrencyShockRiskPct,
    bookSummary: metrics.bookSummary,
    currencies: metrics.currencies,
    shocks: metrics.shocks,
    shockScenarios: metrics.shockScenarios,
    activeShockPercent: metrics.shockPercent,
    worstShock: metrics.worstShock,
    worstShockEquityPct: metrics.worstShockEquityPct,
    dataQuality,
    snapshot,
  };
}
