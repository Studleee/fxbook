import type { Position, Quote } from '../../models';
import {
  conversionRatesForBook,
  splitPair,
  type FxConversionRates,
} from '../../fx/pips';
import { quoteToAccountCurrency } from './positionSensitivity';

export function currencyAmountToAccount(args: {
  amount: number;
  currency: string;
  accountCurrency: string;
  conversionRates: FxConversionRates;
}): number | null {
  if (!Number.isFinite(args.amount)) return null;
  if (args.currency === args.accountCurrency) return args.amount;
  if (args.accountCurrency === 'USD' && args.currency === 'USD') return args.amount;
  const usdPerUnit = args.conversionRates[args.currency];
  if (args.accountCurrency === 'USD' && usdPerUnit != null) return args.amount * usdPerUnit;
  if (args.currency === 'USD' && args.conversionRates[args.accountCurrency] != null) {
    return args.amount / args.conversionRates[args.accountCurrency];
  }
  return quoteToAccountCurrency({
    amountQuote: args.amount,
    quoteCurrency: args.currency,
    accountCurrency: args.accountCurrency,
    conversionRates: args.conversionRates,
  });
}

/**
 * Absolute position notional in account currency.
 * Uses base/quote semantics — does not invent USD when conversion is unavailable.
 */
export function calculatePositionAbsoluteExposure(args: {
  position: Position;
  quotes: Record<string, Quote>;
  accountCurrency: string;
  conversionRates?: FxConversionRates;
}): number | null {
  const [base, quote] = splitPair(args.position.pair);
  const rates =
    args.conversionRates ?? conversionRatesForBook(args.quotes, [args.position]);
  const { units, current: price } = args.position;

  if (quote === args.accountCurrency) {
    return Math.abs(units * price);
  }
  if (base === args.accountCurrency) {
    return Math.abs(units);
  }

  const quoteNotional = Math.abs(units * price);
  return currencyAmountToAccount({
    amount: quoteNotional,
    currency: quote,
    accountCurrency: args.accountCurrency,
    conversionRates: rates,
  });
}

export interface CurrencyLegAttribution {
  positionId: string;
  pair: string;
  side: Position['side'];
  units: number;
  leg: 'BASE' | 'QUOTE';
  signedNative: number;
  accountWeight: number | null;
}

export interface CurrencyExposureRow {
  currency: string;
  longExposure: number;
  shortExposure: number;
  netExposure: number;
  /** Share of total gross currency-leg exposure (account-currency weighted). */
  grossBookShare: number;
  attributions: CurrencyLegAttribution[];
}

/**
 * Currency exposure book — native units for display, account currency for weighting.
 *
 * Each open FX position decomposes into a signed base leg and signed quote leg.
 * Display columns (long / short / net) aggregate native currency amounts per CCY.
 *
 * GROSS BOOK SHARE:
 *   For each leg: |native amount| → convert to account currency (no cross-native comparison).
 *   Row share = sum(row leg weights in account CCY) / sum(all leg weights in account CCY).
 *
 * Because every pair contributes two legs, total gross currency-leg exposure is
 * typically ~2× gross pair notional — both legs count toward the denominator.
 */
export function calculateCurrencyExposureBook(args: {
  positions: Position[];
  quotes: Record<string, Quote>;
  accountCurrency: string;
}): { rows: CurrencyExposureRow[]; grossAccount: number } {
  const rates = conversionRatesForBook(args.quotes, args.positions);
  const legMap = new Map<string, CurrencyLegAttribution[]>();

  for (const pos of args.positions) {
    const [base, quote] = splitPair(pos.pair);
    const sign = pos.side === 'LONG' ? 1 : -1;
    const baseSigned = sign * pos.units;
    const quoteSigned = -sign * pos.units * pos.current;

    const legs: Array<{ currency: string; signedNative: number; leg: 'BASE' | 'QUOTE' }> = [
      { currency: base, signedNative: baseSigned, leg: 'BASE' },
      { currency: quote, signedNative: quoteSigned, leg: 'QUOTE' },
    ];

    for (const leg of legs) {
      const accountWeight = currencyAmountToAccount({
        amount: Math.abs(leg.signedNative),
        currency: leg.currency,
        accountCurrency: args.accountCurrency,
        conversionRates: rates,
      });
      const list = legMap.get(leg.currency) ?? [];
      list.push({
        positionId: pos.id,
        pair: pos.pair,
        side: pos.side,
        units: pos.units,
        leg: leg.leg,
        signedNative: leg.signedNative,
        accountWeight,
      });
      legMap.set(leg.currency, list);
    }
  }

  const rows: CurrencyExposureRow[] = [];
  let grossAccount = 0;

  for (const [currency, attributions] of legMap) {
    let longExposure = 0;
    let shortExposure = 0;
    let netExposure = 0;
    let rowAccountGross = 0;
    for (const a of attributions) {
      netExposure += a.signedNative;
      if (a.signedNative >= 0) longExposure += a.signedNative;
      else shortExposure += Math.abs(a.signedNative);
      if (a.accountWeight != null) rowAccountGross += a.accountWeight;
    }
    grossAccount += rowAccountGross;
    rows.push({
      currency,
      longExposure,
      shortExposure,
      netExposure,
      grossBookShare: 0,
      attributions,
    });
  }

  if (grossAccount > 0) {
    for (const row of rows) {
      const rowGross = row.attributions.reduce(
        (sum, a) => sum + (a.accountWeight ?? 0),
        0,
      );
      row.grossBookShare = (rowGross / grossAccount) * 100;
    }
  }

  return {
    rows: rows.sort((a, b) => b.grossBookShare - a.grossBookShare),
    grossAccount,
  };
}

export function calculateBookExposureSummary(args: {
  positions: Position[];
  quotes: Record<string, Quote>;
  accountCurrency: string;
  equity: number;
}): {
  openCount: number;
  grossExposure: number | null;
  netExposure: number | null;
  equity: number;
  grossLeverage: number | null;
} {
  const rates = conversionRatesForBook(args.quotes, args.positions);
  let gross = 0;
  let net = 0;
  let complete = true;

  for (const pos of args.positions) {
    const abs = calculatePositionAbsoluteExposure({
      position: pos,
      quotes: args.quotes,
      accountCurrency: args.accountCurrency,
      conversionRates: rates,
    });
    if (abs == null) {
      complete = false;
      continue;
    }
    gross += abs;
    const sign = pos.side === 'LONG' ? 1 : -1;
    net += sign * abs;
  }

  return {
    openCount: args.positions.length,
    grossExposure: complete ? gross : null,
    netExposure: complete ? net : null,
    equity: args.equity,
    grossLeverage:
      complete && args.equity > 0 ? gross / args.equity : null,
  };
}
