import type { Position, Quote } from '../../models';
import type { CurrencyExposureRow } from './exposure';
import {
  calculateBookExposureSummary,
  calculateCurrencyExposureBook,
  currencyAmountToAccount,
} from './exposure';
import { conversionRatesForBook } from '../../fx/pips';
import {
  calculateCurrencyShock,
  currenciesFromPositions,
  formatShockScenario,
  SHOCK_LEVELS,
} from './currencyShock';
import { calculateRiskUtilization } from './riskUtilization';
import {
  calculateShockContributions,
  calculateShockDecomposition,
  type ShockContributionRow,
  type ShockDecomposition,
} from './shockContributions';
import type {
  BookSummary,
  CurrencyShockResult,
  WorstShockHeadline,
} from './types';
import { DEFAULT_SHOCK_PERCENT } from './types';

export interface CurrencyCapacityRow extends CurrencyExposureRow {
  netNative: number;
  accountEquivalent: number | null;
  adverseShockPnL: number | null;
  adverseShockEquityPct: number | null;
  riskUtilizationPct: number | null;
  remainingCapacityPct: number | null;
}

export interface EnrichedCurrencyShock extends CurrencyShockResult {
  decomposition: ShockDecomposition;
  contributions: ShockContributionRow[];
}

export interface BookMetrics {
  accountCurrency: string;
  equity: number;
  shockPercent: number;
  maxCurrencyShockRiskPct: number;
  bookSummary: BookSummary;
  currencies: CurrencyCapacityRow[];
  shocks: EnrichedCurrencyShock[];
  shockScenarios: Record<string, EnrichedCurrencyShock[]>;
  worstShock: WorstShockHeadline | null;
  worstShockEquityPct: number | null;
}

export interface CalculateBookMetricsArgs {
  positions: Position[];
  quotes: Record<string, Quote>;
  equity: number;
  accountCurrency: string;
  shockPercent?: number;
  maxCurrencyShockRiskPct?: number;
}

function enrichShock(shock: CurrencyShockResult, equity: number): CurrencyShockResult {
  const worst = shock.worstCasePnL;
  return {
    ...shock,
    worstCasePercentEquity:
      worst != null && equity > 0 ? (worst / equity) * 100 : null,
  };
}

function enrichShockFull(shock: CurrencyShockResult, equity: number): EnrichedCurrencyShock {
  const base = enrichShock(shock, equity);
  return {
    ...base,
    decomposition: calculateShockDecomposition(base.worstCaseImpacts),
    contributions: calculateShockContributions(base),
  };
}

function levelLabel(p: number): string {
  return `${(p * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function calculateBookMetrics(args: CalculateBookMetricsArgs): BookMetrics {
  const shockPercent = args.shockPercent ?? DEFAULT_SHOCK_PERCENT;
  const maxCurrencyShockRiskPct = args.maxCurrencyShockRiskPct ?? 1.0;
  const rates = conversionRatesForBook(args.quotes, args.positions);

  const bookSummary = calculateBookExposureSummary({
    positions: args.positions,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
    equity: args.equity,
  });

  const currencyBook = calculateCurrencyExposureBook({
    positions: args.positions,
    quotes: args.quotes,
    accountCurrency: args.accountCurrency,
  });

  const currencyList = currenciesFromPositions(args.positions);
  const shockScenarios: Record<string, EnrichedCurrencyShock[]> = {};

  for (const level of SHOCK_LEVELS) {
    shockScenarios[String(level)] = currencyList
      .map((ccy) =>
        enrichShockFull(
          calculateCurrencyShock({
            positions: args.positions,
            currency: ccy,
            shockPercent: level,
            quotes: args.quotes,
            accountCurrency: args.accountCurrency,
          }),
          args.equity,
        ),
      )
      .sort((a, b) => Math.abs(b.worstCasePnL ?? 0) - Math.abs(a.worstCasePnL ?? 0));
  }

  const activeShocks = shockScenarios[String(shockPercent)] ?? [];
  const shockByCurrency = new Map(activeShocks.map((s) => [s.currency, s]));

  const currencies: CurrencyCapacityRow[] = currencyBook.rows.map((row) => {
    const shock = shockByCurrency.get(row.currency);
    const adversePct = shock?.worstCasePercentEquity ?? null;
    const util = calculateRiskUtilization({
      adverseShockEquityPct: adversePct,
      maxCurrencyShockRiskPct,
    });
    return {
      ...row,
      netNative: row.netExposure,
      accountEquivalent: currencyAmountToAccount({
        amount: row.netExposure,
        currency: row.currency,
        accountCurrency: args.accountCurrency,
        conversionRates: rates,
      }),
      adverseShockPnL: shock?.worstCasePnL ?? null,
      adverseShockEquityPct: adversePct,
      riskUtilizationPct: util.utilizationPct,
      remainingCapacityPct: util.remainingCapacityPct,
    };
  });

  currencies.sort((a, b) => (b.riskUtilizationPct ?? 0) - (a.riskUtilizationPct ?? 0));

  let worstShock: WorstShockHeadline | null = null;
  let worstShockEquityPct: number | null = null;

  for (const s of activeShocks) {
    if (s.worstCasePnL == null) continue;
    if (!worstShock || s.worstCasePnL < worstShock.bookImpact) {
      const direction = s.worstCasePnL === s.upShockPnL ? 'UP' : 'DOWN';
      worstShock = {
        currency: s.currency,
        shockPercent: levelLabel(shockPercent),
        scenarioLabel: formatShockScenario({
          currency: s.currency,
          direction,
          shockPercent,
        }),
        bookImpact: s.worstCasePnL,
        equityImpact: s.worstCasePercentEquity,
      };
      worstShockEquityPct = s.worstCasePercentEquity;
    }
  }

  return {
    accountCurrency: args.accountCurrency,
    equity: args.equity,
    shockPercent,
    maxCurrencyShockRiskPct,
    bookSummary,
    currencies,
    shocks: activeShocks,
    shockScenarios,
    worstShock,
    worstShockEquityPct,
  };
}
