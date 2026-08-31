import type { Candle } from '../models';
import type { ClosedTrade, MfeMaeSummary } from './types';
import { calculatePips } from '../fx/pips';
import { median, percentile } from './math';

export interface MfeMaeInput {
  trade: ClosedTrade;
  candlesDuringTrade: Candle[];
}

/**
 * MFE/MAE from candle highs/lows during trade hold window.
 * Returns null fields when candle history does not cover the trade.
 */
export function calculateMFE(args: {
  pair: string;
  side: ClosedTrade['direction'];
  entryPrice: number;
  candles: Candle[];
}): number | null {
  if (!args.candles.length) return null;
  let best = args.entryPrice;
  for (const c of args.candles) {
    const favorable = args.side === 'LONG' ? c.high : c.low;
    best = args.side === 'LONG' ? Math.max(best, favorable) : Math.min(best, favorable);
  }
  return Math.abs(
    calculatePips({
      pair: args.pair,
      side: args.side,
      entryPrice: args.entryPrice,
      currentPrice: best,
    }),
  );
}

export function calculateMAE(args: {
  pair: string;
  side: ClosedTrade['direction'];
  entryPrice: number;
  candles: Candle[];
}): number | null {
  if (!args.candles.length) return null;
  let worst = args.entryPrice;
  for (const c of args.candles) {
    const adverse = args.side === 'LONG' ? c.low : c.high;
    worst = args.side === 'LONG' ? Math.min(worst, adverse) : Math.max(worst, adverse);
  }
  return Math.abs(
    calculatePips({
      pair: args.pair,
      side: args.side,
      entryPrice: args.entryPrice,
      currentPrice: worst,
    }),
  );
}

export function enrichTradeMfeMae(
  trade: ClosedTrade,
  candlesByPair: Record<string, Candle[]>,
): ClosedTrade {
  const candles = (candlesByPair[trade.pair] ?? []).filter(
    (c) => c.time * 1000 >= trade.entryTime && c.time * 1000 <= trade.exitTime,
  );
  if (!candles.length) return trade;
  const mfePips = calculateMFE({
    pair: trade.pair,
    side: trade.direction,
    entryPrice: trade.entryPrice,
    candles,
  });
  const maePips = calculateMAE({
    pair: trade.pair,
    side: trade.direction,
    entryPrice: trade.entryPrice,
    candles,
  });
  return {
    ...trade,
    mfePips,
    maePips,
    mfe: mfePips,
    mae: maePips,
  };
}

export function summarizeMfeMae(trades: ClosedTrade[]): MfeMaeSummary {
  const withMfe = trades.filter((t) => t.mfePips != null);
  const withMae = trades.filter((t) => t.maePips != null);
  if (!withMfe.length && !withMae.length) {
    return {
      available: false,
      reason: 'MFE/MAE require candle history during each trade hold window — not yet available.',
      medianWinnerMfePips: null,
      medianLoserMaePips: null,
      p75WinnerMfePips: null,
      p90LoserMaePips: null,
    };
  }
  const winnerMfe = withMfe.filter((t) => t.realizedPnL > 0).map((t) => t.mfePips as number);
  const loserMae = withMae.filter((t) => t.realizedPnL < 0).map((t) => t.maePips as number);
  return {
    available: true,
    reason: 'Computed from available candle paths during trade windows.',
    medianWinnerMfePips: median(winnerMfe),
    medianLoserMaePips: median(loserMae),
    p75WinnerMfePips: percentile(winnerMfe, 75),
    p90LoserMaePips: percentile(loserMae, 90),
  };
}
