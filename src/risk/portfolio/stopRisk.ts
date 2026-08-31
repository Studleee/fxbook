import type { Position, Quote } from '../../models';
import {
  calculatePositionFxMetrics,
  conversionRatesForBook,
} from '../../fx/pips';
import type { StopRiskRow, StopRiskSummary } from './types';

/**
 * Stop-loss risk = unrealized loss if price reaches the active hard stop.
 * Uses position.stop from state (not policy default) — null/0 → NO STOP.
 */
export function calculateStopRiskRow(args: {
  position: Position;
  quotes: Record<string, Quote>;
  equity: number;
  accountCurrency: string;
}): StopRiskRow {
  const hasStop = args.position.stop > 0;
  if (!hasStop) {
    return {
      positionId: args.position.id,
      pair: args.position.pair,
      currentPrice: args.position.current,
      stop: null,
      units: args.position.units,
      stopLossPnL: null,
      stopLossPctEquity: null,
      hasStop: false,
    };
  }

  const rates = conversionRatesForBook(args.quotes, [args.position]);
  const fx = calculatePositionFxMetrics({
    pair: args.position.pair,
    side: args.position.side,
    units: args.position.units,
    entryPrice: args.position.entry,
    currentPrice: args.position.current,
    stopPrice: args.position.stop,
    conversionRates: rates,
    brokerUnrealizedPnl: args.position.unrealizedPnl,
  });

  const stopLossPnL =
    fx.stopRiskUSD != null && Number.isFinite(fx.stopRiskUSD)
      ? -Math.abs(fx.stopRiskUSD)
      : null;

  return {
    positionId: args.position.id,
    pair: args.position.pair,
    currentPrice: args.position.current,
    stop: args.position.stop,
    units: args.position.units,
    stopLossPnL,
    stopLossPctEquity:
      stopLossPnL != null && args.equity > 0
        ? (Math.abs(stopLossPnL) / args.equity) * 100
        : null,
    hasStop: true,
  };
}

export function calculateStopRiskSummary(args: {
  positions: Position[];
  quotes: Record<string, Quote>;
  equity: number;
  accountCurrency: string;
}): StopRiskSummary {
  const rows = args.positions.map((p) =>
    calculateStopRiskRow({
      position: p,
      quotes: args.quotes,
      equity: args.equity,
      accountCurrency: args.accountCurrency,
    }),
  );
  const withStop = rows.filter((r) => r.hasStop && r.stopLossPnL != null);
  const totalStopRisk = withStop.length
    ? withStop.reduce((s, r) => s + (r.stopLossPnL ?? 0), 0)
    : null;
  return {
    rows,
    totalStopRisk,
    stopRiskPctEquity:
      totalStopRisk != null && args.equity > 0
        ? (Math.abs(totalStopRisk) / args.equity) * 100
        : null,
  };
}
