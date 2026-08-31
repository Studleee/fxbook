import type { Position, Quote } from '../../models';
import { getPipSize, splitPair } from '../../fx/pips';
import { calculatePairShockPnL } from './positionSensitivity';
import type { CurrencyShockImpact, CurrencyShockResult } from './types';

export const SHOCK_LEVELS = [0.0005, 0.001, 0.0025, 0.005, 0.01] as const;

const PIP_EPS = 1e-9;

export type ShockDirection = 'UP' | 'DOWN';

export function shockDirectionLabel(direction: ShockDirection | null): string {
  if (direction === 'UP') return 'STRENGTHENS';
  if (direction === 'DOWN') return 'WEAKENS';
  return '';
}

export function formatShockScenario(args: {
  currency: string;
  direction: ShockDirection | null;
  shockPercent: number;
}): string {
  const verb = shockDirectionLabel(args.direction);
  const pct = (Math.abs(args.shockPercent) * 100).toFixed(2).replace(/\.?0+$/, '');
  return verb ? `${args.currency} ${verb} ${pct}%` : args.currency;
}

export function shockPriceChangePips(
  pair: string,
  oldPrice: number,
  shockedPrice: number,
): number | null {
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return null;
  return (shockedPrice - oldPrice) / getPipSize(pair);
}

export function isShockAffectedImpact(
  impact: CurrencyShockImpact,
  currency: string,
): boolean {
  const [base, quote] = splitPair(impact.pair);
  if (base !== currency && quote !== currency) return false;
  return impact.priceChangePips != null && Math.abs(impact.priceChangePips) > PIP_EPS;
}

export function countAffectedPositions(args: {
  strengthenImpacts: CurrencyShockImpact[];
  weakenImpacts: CurrencyShockImpact[];
  currency: string;
}): number {
  const pairs = new Set<string>();
  for (const imp of [...args.strengthenImpacts, ...args.weakenImpacts]) {
    if (!isShockAffectedImpact(imp, args.currency)) continue;
    pairs.add(imp.pair);
  }
  return pairs.size;
}export function shockedPairPrice(args: {
  pair: string;
  currentPrice: number;
  currency: string;
  shockPercent: number;
  quotes: Record<string, Quote>;
}): number {
  const [base, quote] = splitPair(args.pair);
  const { currentPrice, currency, shockPercent } = args;

  if (base === currency) return currentPrice * (1 + shockPercent);
  if (quote === currency) return currentPrice * (1 - shockPercent);

  const mid = (p: string) => {
    const q = args.quotes[p];
    return q ? (q.bid + q.ask) / 2 : null;
  };
  const baseUsd =
    base === 'USD' ? 1 : mid(`${base}/USD`) ?? (mid(`USD/${base}`) ? 1 / mid(`USD/${base}`)! : null);
  const quoteUsd =
    quote === 'USD' ? 1 : mid(`${quote}/USD`) ?? (mid(`USD/${quote}`) ? 1 / mid(`USD/${quote}`)! : null);

  if (baseUsd != null && quoteUsd != null && quoteUsd > 0) {
    let newBaseUsd = baseUsd;
    let newQuoteUsd = quoteUsd;
    if (base === currency) newBaseUsd *= 1 + shockPercent;
    if (quote === currency) newQuoteUsd *= 1 - shockPercent;
    if (base !== currency && quote !== currency) return currentPrice;
    return newBaseUsd / newQuoteUsd;
  }

  return currentPrice;
}

function shockBookOnce(args: {
  positions: Position[];
  currency: string;
  shockPercent: number;
  quotes: Record<string, Quote>;
  accountCurrency: string;
}): { impacts: CurrencyShockImpact[]; total: number | null } {
  const impacts: CurrencyShockImpact[] = [];
  let total: number | null = 0;

  for (const pos of args.positions) {
    const oldPrice = pos.current;
    const shockedPrice = shockedPairPrice({
      pair: pos.pair,
      currentPrice: oldPrice,
      currency: args.currency,
      shockPercent: args.shockPercent,
      quotes: args.quotes,
    });
    const actualShock = oldPrice > 0 ? (shockedPrice - oldPrice) / oldPrice : 0;
    const { pnl } = calculatePairShockPnL({
      position: { ...pos, current: oldPrice },
      shockPercent: actualShock,
      quotes: args.quotes,
      accountCurrency: args.accountCurrency,
    });
    impacts.push({
      pair: pos.pair,
      direction: pos.side,
      units: pos.units,
      oldPrice,
      shockedPrice,
      pnlImpact: pnl,
      priceChangePips: shockPriceChangePips(pos.pair, oldPrice, shockedPrice),
    });
    if (pnl == null) total = null;
    else if (total != null) total += pnl;
  }

  return { impacts, total };
}

export function calculateCurrencyShock(args: {
  positions: Position[];
  currency: string;
  shockPercent: number;
  quotes: Record<string, Quote>;
  accountCurrency: string;
}): CurrencyShockResult {
  const { impacts, total } = shockBookOnce(args);
  const up = shockBookOnce({ ...args, shockPercent: Math.abs(args.shockPercent) });
  const down = shockBookOnce({ ...args, shockPercent: -Math.abs(args.shockPercent) });
  const worst =
    up.total != null && down.total != null ? Math.min(up.total, down.total) : total;
  const worstDirection: 'UP' | 'DOWN' | null =
    up.total != null && down.total != null
      ? up.total <= down.total
        ? 'UP'
        : 'DOWN'
      : null;
  const worstCaseImpacts = worstDirection === 'UP' ? up.impacts : down.impacts;

  return {
    currency: args.currency,
    shockPercent: args.shockPercent,
    positionImpacts: impacts,
    totalPnLImpact: total,
    upShockPnL: up.total,
    downShockPnL: down.total,
    worstCasePnL: worst,
    worstCasePercentEquity: null,
    worstDirection,
    worstCaseImpacts,
    affectedPositionCount: countAffectedPositions({
      strengthenImpacts: up.impacts,
      weakenImpacts: down.impacts,
      currency: args.currency,
    }),
    riskContributionPct: null,
  };
}
export function currenciesFromPositions(positions: Position[]): string[] {
  const set = new Set<string>();
  for (const p of positions) {
    const [base, quote] = splitPair(p.pair);
    set.add(base);
    set.add(quote);
  }
  return [...set].sort();
}

/** Split component risk 50/50 across base and quote legs per pair. */
export function attributeCurrencyRiskContribution(args: {
  shocks: CurrencyShockResult[];
  componentByPair: Map<string, number>;
  positions: Position[];
}): void {
  const currencyAbs: Record<string, number> = {};
  for (const pos of args.positions) {
    const [base, quote] = splitPair(pos.pair);
    const comp = Math.abs(args.componentByPair.get(pos.pair) ?? 0);
    if (comp === 0) continue;
    currencyAbs[base] = (currencyAbs[base] ?? 0) + comp * 0.5;
    currencyAbs[quote] = (currencyAbs[quote] ?? 0) + comp * 0.5;
  }
  const total = Object.values(currencyAbs).reduce((s, v) => s + v, 0);
  for (const shock of args.shocks) {
    shock.riskContributionPct =
      total > 0 ? ((currencyAbs[shock.currency] ?? 0) / total) * 100 : null;
  }
}
