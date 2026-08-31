import type { Quote, Side } from '../models';

/** USD value of one unit of a currency (e.g. GBP → 1.35). */
export type FxConversionRates = Record<string, number>;

export interface PositionFxMetrics {
  pipSize: number;
  pips: number;
  pipValueQuote: number;
  pipValueUSD: number;
  estimatedPnlUSD: number;
  stopLossPips: number | null;
  stopRiskUSD: number | null;
  takeProfitPips: number | null;
  takeProfitUSD: number | null;
  trailDistancePips: number | null;
  trailRiskUSD: number | null;
}

export function splitPair(pair: string): [string, string] {
  const [base, quote] = pair.split('/');
  if (!base || !quote) throw new Error(`Invalid FX pair: ${pair}`);
  return [base, quote];
}

export function getPipSize(pair: string): number {
  return pair.includes('JPY') ? 0.01 : 0.0001;
}

export function calculatePips(args: {
  pair: string;
  side: Side;
  entryPrice: number;
  currentPrice: number;
}): number {
  const direction = args.side === 'LONG' ? 1 : -1;
  return ((args.currentPrice - args.entryPrice) / getPipSize(args.pair)) * direction;
}

export function calculatePipValueQuote(args: { pair: string; units: number }): number {
  return args.units * getPipSize(args.pair);
}

export function quoteCurrencyToUsd(
  quoteCcy: string,
  conversionRates: FxConversionRates,
): number | null {
  if (quoteCcy === 'USD') return 1;
  const direct = conversionRates[quoteCcy];
  if (direct != null && direct > 0) return direct;
  return null;
}

function quoteMid(quote: Quote): number | null {
  const mid = (quote.bid + quote.ask) / 2;
  return Number.isFinite(mid) && mid > 0 ? mid : null;
}

/**
 * Build ccy → USD rates from all desk quotes, including cross-pair triangulation
 * (e.g. CHF via EUR/USD ÷ EUR/CHF, JPY via AUD/JPY once AUD is known).
 */
export function buildUsdConversionRates(
  quotes: Record<string, Quote>,
  extraMids: Record<string, number> = {},
): FxConversionRates {
  const rates: FxConversionRates = { USD: 1 };
  const mids = new Map<string, number>();

  for (const [pair, quote] of Object.entries(quotes)) {
    try {
      const mid = quoteMid(quote);
      if (mid != null) mids.set(pair, mid);
    } catch {
      /* skip malformed pair keys */
    }
  }

  for (const [pair, mid] of Object.entries(extraMids)) {
    if (Number.isFinite(mid) && mid > 0) mids.set(pair, mid);
  }

  for (const [pair, mid] of mids) {
    try {
      const [base, quoteCcy] = splitPair(pair);
      if (quoteCcy === 'USD') rates[base] = mid;
      if (base === 'USD') rates[quoteCcy] = 1 / mid;
    } catch {
      /* skip */
    }
  }

  const maxPasses = mids.size + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const [pair, mid] of mids) {
      try {
        const [base, quoteCcy] = splitPair(pair);
        if (rates[base] != null && rates[quoteCcy] == null) {
          rates[quoteCcy] = rates[base] / mid;
          changed = true;
        }
        if (rates[quoteCcy] != null && rates[base] == null) {
          rates[base] = rates[quoteCcy] * mid;
          changed = true;
        }
      } catch {
        /* skip */
      }
    }
    if (!changed) break;
  }

  return rates;
}

/** Mid prices from open positions — strengthens cross-pair USD conversion (e.g. USD/CHF). */
export function collectPositionMids(
  positions: readonly { pair: string; current: number }[],
): Record<string, number> {
  const mids: Record<string, number> = {};
  for (const p of positions) {
    if (p.current > 0) mids[p.pair] = p.current;
  }
  return mids;
}

export function conversionRatesForBook(
  quotes: Record<string, Quote>,
  positions: readonly { pair: string; current: number }[],
): FxConversionRates {
  return buildUsdConversionRates(quotes, collectPositionMids(positions));
}

export function calculatePipValueUSD(args: {
  pair: string;
  units: number;
  currentPrice: number;
  conversionRates?: FxConversionRates;
}): number {
  const [base, quote] = splitPair(args.pair);
  const pip = getPipSize(args.pair);
  const { units, currentPrice } = args;
  const rates = args.conversionRates ?? {};

  if (quote === 'USD') return units * pip;
  if (base === 'USD') return (units * pip) / currentPrice;

  const pipValueQuote = units * pip;
  const quoteToUsd = quoteCurrencyToUsd(quote, rates);
  if (quoteToUsd != null) return pipValueQuote * quoteToUsd;

  const baseToUsd = rates[base];
  if (baseToUsd != null && baseToUsd > 0 && currentPrice > 0) {
    return (pipValueQuote / currentPrice) * baseToUsd;
  }

  return Number.NaN;
}

export function calculateEstimatedPnlUSD(args: {
  pips: number;
  pipValueUSD: number;
}): number {
  return args.pips * args.pipValueUSD;
}

export function calculateStopRisk(args: {
  pipValueUSD: number;
  stopLossPips: number;
}): number {
  return args.stopLossPips * args.pipValueUSD;
}

export function calculateTakeProfitValue(args: {
  pipValueUSD: number;
  takeProfitPips: number;
}): number {
  return args.takeProfitPips * args.pipValueUSD;
}

export function calculateTrailRisk(args: {
  pipValueUSD: number;
  trailingDistancePips: number;
}): number {
  return args.trailingDistancePips * args.pipValueUSD;
}

/** Derive position size from margin when units are not supplied directly. */
export function unitsFromMargin(marginUsed: number, marginRate: number): number {
  return marginRate > 0 ? marginUsed / marginRate : 0;
}

export function calculatePositionFxMetrics(args: {
  pair: string;
  side: Side;
  units: number;
  entryPrice: number;
  currentPrice: number;
  stopPrice?: number | null;
  takeProfitPips?: number | null;
  trailDistancePips?: number | null;
  conversionRates?: FxConversionRates;
  /** When set, used to infer $/pip if FX conversion is incomplete (e.g. OANDA cross). */
  brokerUnrealizedPnl?: number;
}): PositionFxMetrics {
  const pipSize = getPipSize(args.pair);
  const pips = calculatePips({
    pair: args.pair,
    side: args.side,
    entryPrice: args.entryPrice,
    currentPrice: args.currentPrice,
  });
  const pipValueQuote = calculatePipValueQuote({ pair: args.pair, units: args.units });
  let pipValueUSD = calculatePipValueUSD({
    pair: args.pair,
    units: args.units,
    currentPrice: args.currentPrice,
    conversionRates: args.conversionRates,
  });
  if (
    !Number.isFinite(pipValueUSD) &&
    args.brokerUnrealizedPnl != null &&
    args.brokerUnrealizedPnl !== 0 &&
    pips !== 0
  ) {
    pipValueUSD = Math.abs(args.brokerUnrealizedPnl / pips);
  }
  const estimatedPnlUSD = calculateEstimatedPnlUSD({ pips, pipValueUSD });

  let stopLossPips: number | null = null;
  let stopRiskUSD: number | null = null;
  if (args.stopPrice != null && args.stopPrice > 0) {
    stopLossPips = Math.abs(
      calculatePips({
        pair: args.pair,
        side: args.side,
        entryPrice: args.entryPrice,
        currentPrice: args.stopPrice,
      }),
    );
    stopRiskUSD = calculateStopRisk({ pipValueUSD, stopLossPips });
  }

  const takeProfitPips =
    args.takeProfitPips != null && args.takeProfitPips > 0 ? args.takeProfitPips : null;
  const takeProfitUSD =
    takeProfitPips != null
      ? calculateTakeProfitValue({ pipValueUSD, takeProfitPips })
      : null;

  const trailDistancePips =
    args.trailDistancePips != null && args.trailDistancePips > 0
      ? args.trailDistancePips
      : null;
  const trailRiskUSD =
    trailDistancePips != null
      ? calculateTrailRisk({ pipValueUSD, trailingDistancePips: trailDistancePips })
      : null;

  return {
    pipSize,
    pips,
    pipValueQuote,
    pipValueUSD,
    estimatedPnlUSD,
    stopLossPips,
    stopRiskUSD,
    takeProfitPips,
    takeProfitUSD,
    trailDistancePips,
    trailRiskUSD,
  };
}

export function formatFxPips(pips: number): string {
  if (!Number.isFinite(pips)) return '—';
  return `${pips >= 0 ? '+' : ''}${pips.toFixed(1)}`;
}

export function formatFxPipValueUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs < 0.01 ? 4 : abs < 0.1 ? 3 : 2;
  return `$${value.toFixed(digits)}`;
}

export function formatFxUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+$${abs}`;
  if (value < 0) return `-$${abs}`;
  return `$${abs}`;
}
