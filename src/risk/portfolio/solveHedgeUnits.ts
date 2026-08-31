import type { Position, Quote, Side } from '../../models';
import { splitPair } from '../../fx/pips';
import { calculateBookMetrics } from './bookMetrics';
import { applyProposedChange } from './simulateBookChange';

export type HedgeTargetType = 'CURRENCY_UTIL' | 'WORST_SHOCK';

export interface SolveHedgeUnitsArgs {
  positions: Position[];
  quotes: Record<string, Quote>;
  equity: number;
  accountCurrency: string;
  shockPercent: number;
  maxCurrencyShockRiskPct: number;
  hedgePair: string;
  hedgeSide: Side;
  /** Currency to bring under capacity (CURRENCY_UTIL target). */
  currency?: string;
  targetType?: HedgeTargetType;
  /** Default 100 — at or below this utilization %. */
  targetUtilizationPct?: number;
  maxSearchUnits?: number;
}

export interface HedgeSolveResult {
  feasible: boolean;
  alreadyAtTarget: boolean;
  unitsNeeded: number;
  targetType: HedgeTargetType;
  currency: string | null;
  targetUtilizationPct: number;
  before: {
    utilizationPct: number | null;
    adverseEquityPct: number | null;
    worstShockEquityPct: number | null;
  };
  after: {
    utilizationPct: number | null;
    adverseEquityPct: number | null;
    worstShockEquityPct: number | null;
  };
  note: string | null;
}

function maxBookUnits(positions: Position[]): number {
  if (!positions.length) return 10_000;
  const max = Math.max(...positions.map((p) => p.units));
  return Math.max(10_000, max * 5);
}

function metricsForUnits(args: SolveHedgeUnitsArgs, units: number) {
  const positions = applyProposedChange(
    args.positions,
    {
      type: 'ADD_POSITION',
      pair: args.hedgePair,
      side: args.hedgeSide,
      units,
    },
    args.quotes,
  );
  return calculateBookMetrics({
    positions,
    quotes: args.quotes,
    equity: args.equity,
    accountCurrency: args.accountCurrency,
    shockPercent: args.shockPercent,
    maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
  });
}

function readCurrency(metrics: ReturnType<typeof calculateBookMetrics>, currency: string) {
  const row = metrics.currencies.find((c) => c.currency === currency);
  return {
    utilizationPct: row?.riskUtilizationPct ?? null,
    adverseEquityPct: row?.adverseShockEquityPct ?? null,
    worstShockEquityPct: metrics.worstShockEquityPct,
  };
}

function meetsTarget(
  metrics: ReturnType<typeof calculateBookMetrics>,
  args: SolveHedgeUnitsArgs,
  targetType: HedgeTargetType,
  targetUtil: number,
): boolean {
  if (targetType === 'WORST_SHOCK') {
    const pct = metrics.worstShockEquityPct;
    if (pct == null) return false;
    return Math.abs(pct) <= args.maxCurrencyShockRiskPct + 1e-9;
  }
  const ccy = args.currency;
  if (!ccy) return false;
  const u = metrics.currencies.find((c) => c.currency === ccy)?.riskUtilizationPct;
  if (u == null) return false;
  return u <= targetUtil + 1e-9;
}

export function suggestHedgeForCurrency(args: {
  currency: string;
  netNative: number;
  pairs: string[];
}): { pair: string; side: Side } | null {
  if (args.netNative === 0) return null;
  for (const pair of args.pairs) {
    try {
      const [base, quote] = splitPair(pair);
      if (base === args.currency) {
        return { pair, side: args.netNative > 0 ? 'SHORT' : 'LONG' };
      }
      if (quote === args.currency) {
        return { pair, side: args.netNative > 0 ? 'LONG' : 'SHORT' };
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

/**
 * Minimum hedge units (ADD_POSITION) to reach target utilization or worst-shock budget.
 * Uses binary search over integer units against the live shock simulation.
 */
export function solveHedgeUnits(args: SolveHedgeUnitsArgs): HedgeSolveResult {
  const targetType = args.targetType ?? 'CURRENCY_UTIL';
  const targetUtil = args.targetUtilizationPct ?? 100;
  const currency = args.currency ?? null;
  const maxUnits = args.maxSearchUnits ?? maxBookUnits(args.positions);

  const currentMetrics = calculateBookMetrics({
    positions: args.positions,
    quotes: args.quotes,
    equity: args.equity,
    accountCurrency: args.accountCurrency,
    shockPercent: args.shockPercent,
    maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
  });

  const before = currency
    ? readCurrency(currentMetrics, currency)
    : {
        utilizationPct: null,
        adverseEquityPct: null,
        worstShockEquityPct: currentMetrics.worstShockEquityPct,
      };

  if (before.utilizationPct == null && targetType === 'CURRENCY_UTIL' && currency) {
    return {
      feasible: false,
      alreadyAtTarget: false,
      unitsNeeded: 0,
      targetType,
      currency,
      targetUtilizationPct: targetUtil,
      before,
      after: before,
      note: 'No shock data for this currency.',
    };
  }

  if (meetsTarget(currentMetrics, args, targetType, targetUtil)) {
    return {
      feasible: true,
      alreadyAtTarget: true,
      unitsNeeded: 0,
      targetType,
      currency,
      targetUtilizationPct: targetUtil,
      before,
      after: before,
      note: 'Already at or under target for this scenario.',
    };
  }

  if (!meetsTarget(metricsForUnits(args, maxUnits), args, targetType, targetUtil)) {
    const afterMax = currency
      ? readCurrency(metricsForUnits(args, maxUnits), currency)
      : {
          utilizationPct: null,
          adverseEquityPct: null,
          worstShockEquityPct: metricsForUnits(args, maxUnits).worstShockEquityPct,
        };
    return {
      feasible: false,
      alreadyAtTarget: false,
      unitsNeeded: maxUnits,
      targetType,
      currency,
      targetUtilizationPct: targetUtil,
      before,
      after: afterMax,
      note: `Target not reachable within ${maxUnits.toLocaleString()} units — try a different hedge pair/side.`,
    };
  }

  let lo = 1;
  let hi = maxUnits;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (meetsTarget(metricsForUnits(args, mid), args, targetType, targetUtil)) hi = mid;
    else lo = mid + 1;
  }

  const afterMetrics = metricsForUnits(args, lo);
  const after = currency
    ? readCurrency(afterMetrics, currency)
    : {
        utilizationPct: null,
        adverseEquityPct: null,
        worstShockEquityPct: afterMetrics.worstShockEquityPct,
      };

  return {
    feasible: true,
    alreadyAtTarget: false,
    unitsNeeded: lo,
    targetType,
    currency,
    targetUtilizationPct: targetUtil,
    before,
    after,
    note: null,
  };
}

/** Currencies currently over the utilization target at the active shock size. */
export function currenciesOverCapacity(
  metrics: { currencies: Array<{ currency: string; riskUtilizationPct: number | null }> },
  targetUtilizationPct = 100,
): string[] {
  return metrics.currencies
    .filter((c) => c.riskUtilizationPct != null && c.riskUtilizationPct > targetUtilizationPct)
    .sort((a, b) => (b.riskUtilizationPct ?? 0) - (a.riskUtilizationPct ?? 0))
    .map((c) => c.currency);
}
