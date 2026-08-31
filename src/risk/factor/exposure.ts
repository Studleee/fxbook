import type { Position, Quote } from '../../models';
import { splitPair } from '../../fx/pips';
import {
  calculateCurrencyExposureBook,
  currencyAmountToAccount,
} from '../portfolio/exposure';
import { conversionRatesForBook } from '../../fx/pips';
import { CURRENCY_FACTORS } from './constants';
import type { FactorExposure } from './types';

/**
 * Build currency-factor exposure vector in account currency.
 * e_c ≈ dollar P&L sensitivity to a small appreciation in factor c
 * (via net native leg converted to account currency).
 */
export function buildFactorExposures(args: {
  positions: Position[];
  quotes: Record<string, Quote>;
  accountCurrency: string;
  factors?: string[];
}): FactorExposure[] {
  const factors = args.factors ?? CURRENCY_FACTORS;
  const rates = conversionRatesForBook(args.quotes, args.positions);
  const book = calculateCurrencyExposureBook({
    positions: args.positions,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
  });

  const rowByCurrency = new Map(book.rows.map((r) => [r.currency, r]));
  let totalAbsAccount = 0;

  const exposures: FactorExposure[] = factors.map((factor) => {
    const row = rowByCurrency.get(factor);
    const netNative = row?.netExposure ?? 0;
    const accountExposure =
      netNative === 0
        ? 0
        : currencyAmountToAccount({
            amount: netNative,
            currency: factor,
            accountCurrency: args.accountCurrency,
            conversionRates: rates,
          });
    const conversionComplete = accountExposure != null;
    if (accountExposure != null) totalAbsAccount += Math.abs(accountExposure);
    return {
      factor,
      netNative,
      accountExposure,
      portfolioWeightPct: null,
      conversionComplete,
    };
  });

  if (totalAbsAccount > 0) {
    for (const e of exposures) {
      if (e.accountExposure != null) {
        e.portfolioWeightPct = (Math.abs(e.accountExposure) / totalAbsAccount) * 100;
      }
    }
  }

  return exposures.filter(
    (e) => e.netNative !== 0 || factors.includes(e.factor),
  );
}

/** Active factors with non-zero book presence or exposure in open pairs. */
export function activeFactorsInBook(positions: Position[], factors?: string[]): string[] {
  const set = new Set<string>();
  const allowed = new Set(factors ?? CURRENCY_FACTORS);
  for (const pos of positions) {
    const [base, quote] = splitPair(pos.pair);
    if (allowed.has(base)) set.add(base);
    if (allowed.has(quote)) set.add(quote);
  }
  return [...set].sort();
}

export function exposureVector(
  exposures: FactorExposure[],
  factorOrder: string[],
): (number | null)[] {
  const map = new Map(exposures.map((e) => [e.factor, e.accountExposure]));
  return factorOrder.map((f) => {
    const v = map.get(f);
    return v != null && Number.isFinite(v) ? v : null;
  });
}
