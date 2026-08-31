import type { Position, Quote } from '../../models';
import {
  calculatePositionFxMetrics,
  conversionRatesForBook,
  splitPair,
  type FxConversionRates,
} from '../../fx/pips';
import type { PositionRiskProfile } from './types';
import { DEFAULT_SHOCK_PERCENT } from './types';

/**
 * P&L in quote currency for a spot position when pair price moves by shockPercent.
 * LONG: units × Δprice; SHORT: −units × Δprice.
 */
export function pairShockPnLQuote(args: {
  side: Position['side'];
  units: number;
  currentPrice: number;
  shockPercent: number;
}): number {
  const delta = args.currentPrice * args.shockPercent;
  const sign = args.side === 'LONG' ? 1 : -1;
  return sign * args.units * delta;
}

export function quoteToAccountCurrency(args: {
  amountQuote: number;
  quoteCurrency: string;
  accountCurrency: string;
  conversionRates: FxConversionRates;
}): number | null {
  const { amountQuote, quoteCurrency, accountCurrency, conversionRates } = args;
  if (!Number.isFinite(amountQuote)) return null;
  if (quoteCurrency === accountCurrency) return amountQuote;

  const quoteToAcct =
    quoteCurrency === 'USD' && accountCurrency === 'USD'
      ? 1
      : quoteCurrency === accountCurrency
        ? 1
        : conversionRates[quoteCurrency] != null && accountCurrency === 'USD'
          ? conversionRates[quoteCurrency]
          : null;

  if (quoteToAcct != null) return amountQuote * quoteToAcct;

  // Account non-USD: convert quote → USD → account if possible
  if (accountCurrency !== 'USD') {
    const toUsd = quoteCurrency === 'USD' ? 1 : conversionRates[quoteCurrency];
    const acctRate = conversionRates[accountCurrency];
    if (toUsd != null && acctRate != null && acctRate > 0) {
      return (amountQuote * toUsd) / acctRate;
    }
  }

  return null;
}

/**
 * Account-currency P&L impact of a +shockPercent move in the pair price.
 * Formula: convert( sign(side) × units × price × shockPercent , quote → account )
 */
export function calculatePairShockPnL(args: {
  position: Pick<Position, 'pair' | 'side' | 'units' | 'current'>;
  shockPercent: number;
  quotes: Record<string, Quote>;
  accountCurrency: string;
  conversionRates?: FxConversionRates;
}): { pnl: number | null; conversionComplete: boolean } {
  const [, quoteCcy] = splitPair(args.position.pair);
  const rates =
    args.conversionRates ?? conversionRatesForBook(args.quotes, [args.position]);
  const quotePnl = pairShockPnLQuote({
    side: args.position.side,
    units: args.position.units,
    currentPrice: args.position.current,
    shockPercent: args.shockPercent,
  });
  const pnl = quoteToAccountCurrency({
    amountQuote: quotePnl,
    quoteCurrency: quoteCcy,
    accountCurrency: args.accountCurrency,
    conversionRates: rates,
  });
  return { pnl, conversionComplete: pnl != null };
}

export function buildPositionRiskProfile(args: {
  position: Position;
  quotes: Record<string, Quote>;
  accountCurrency: string;
  oneHourVolatility: number | null;
  conversionRates?: FxConversionRates;
}): PositionRiskProfile {
  const [baseCurrency, quoteCurrency] = splitPair(args.position.pair);
  const rates =
    args.conversionRates ?? conversionRatesForBook(args.quotes, [args.position]);
  const shock = calculatePairShockPnL({
    position: args.position,
    shockPercent: DEFAULT_SHOCK_PERCENT,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
    conversionRates: rates,
  });
  const sensitivity = calculatePairShockPnL({
    position: args.position,
    shockPercent: 1,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
    conversionRates: rates,
  });

  const fx = calculatePositionFxMetrics({
    pair: args.position.pair,
    side: args.position.side,
    units: args.position.units,
    entryPrice: args.position.entry,
    currentPrice: args.position.current,
    stopPrice: args.position.stop > 0 ? args.position.stop : null,
    conversionRates: rates,
    brokerUnrealizedPnl: args.position.unrealizedPnl,
  });

  const signedUnits = args.position.side === 'LONG' ? args.position.units : -args.position.units;
  const standaloneOneHourRisk =
    shock.pnl != null && args.oneHourVolatility != null
      ? Math.abs(shock.pnl) * args.oneHourVolatility
      : null;

  return {
    positionId: args.position.id,
    pair: args.position.pair,
    baseCurrency,
    quoteCurrency,
    direction: args.position.side,
    units: args.position.units,
    signedUnits,
    currentPrice: args.position.current,
    entryPrice: args.position.entry,
    hardStop: args.position.stop > 0 ? args.position.stop : null,
    stopLossPips: fx.stopLossPips,
    unrealizedPnL: args.position.unrealizedPnl,
    marginUsed: args.position.margin,
    pairMoveSensitivity: sensitivity.pnl,
    dollarPnLPer0_10PercentMove: shock.pnl,
    oneHourVolatility: args.oneHourVolatility,
    standaloneOneHourRisk,
    conversionComplete: shock.conversionComplete,
  };
}
