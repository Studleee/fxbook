import type { Candle, Position, Quote, Side } from '../../models';
import {
  calculateCorrelationMatrix,
  classifyPositionRelationship,
  correlationCell,
} from '../../analytics/correlation';
import type { CorrelationWindow } from '../../analytics/types';
import type { BookMetrics } from './bookMetrics';
import { calculateBookMetrics } from './bookMetrics';
import {
  classifyMarginalRisk,
  worstShockRiskDelta,
} from './classifyMarginalRisk';
import type { MarginalRiskClassification } from './decisionConfig';
import {
  applyProposedChange,
  normalizePair,
  type ProposedBookChange,
} from './simulateBookChange';

export interface MetricTriple<T> {
  before: T;
  after: T;
  change: T extends number ? number | null : T;
}

export interface MarginalCurrencyRisk {
  currency: string;
  beforeEquityPct: number | null;
  afterEquityPct: number | null;
  marginalEquityPct: number | null;
  beforePnL: number | null;
  afterPnL: number | null;
  marginalPnL: number | null;
  label: string;
}

export interface CorrelationContextItem {
  pairA: string;
  pairB: string;
  correlation: number | null;
  window: CorrelationWindow;
  relationship: string;
  existingSide: Side | null;
  proposedSide: Side;
}

export interface BookComparisonResult {
  current: BookMetrics;
  hypothetical: BookMetrics;
  grossExposure: MetricTriple<number | null>;
  grossLeverage: MetricTriple<number | null>;
  worstShockEquityPct: MetricTriple<number | null>;
  currencyShockEquityPct: Record<string, MetricTriple<number | null>>;
  marginalCurrencyRisks: MarginalCurrencyRisk[];
  riskDeltaEquityPct: number | null;
  classification: MarginalRiskClassification;
  correlationContext: CorrelationContextItem[];
}

export interface SimulateBookChangeArgs {
  positions: Position[];
  quotes: Record<string, Quote>;
  equity: number;
  accountCurrency: string;
  shockPercent: number;
  maxCurrencyShockRiskPct: number;
  change: ProposedBookChange;
  candlesByPair?: Record<string, Candle[]>;
  correlationWindow?: CorrelationWindow;
}

export interface SimulateBookChangeResult {
  comparison: BookComparisonResult;
}

function deltaNum(before: number | null, after: number | null): number | null {
  if (before == null || after == null) return null;
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return after - before;
}

function triple<T extends number | null>(before: T, after: T): MetricTriple<T> {
  return {
    before,
    after,
    change: deltaNum(before, after) as MetricTriple<T>['change'],
  };
}

export function formatMarginalRiskLabel(marginalPnL: number | null): string {
  if (marginalPnL == null || !Number.isFinite(marginalPnL)) return 'N/A';
  if (marginalPnL < 0) return `${Math.abs(marginalPnL).toFixed(2)} more downside`;
  if (marginalPnL > 0) return `${marginalPnL.toFixed(2)} risk reduction`;
  return 'no change';
}

export function buildCorrelationContext(args: {
  positions: Position[];
  proposedPair: string;
  proposedSide: Side;
  candlesByPair: Record<string, Candle[]>;
  correlationWindow?: CorrelationWindow;
}): CorrelationContextItem[] {
  const pair = normalizePair(args.proposedPair);
  const window = args.correlationWindow ?? '7D';
  const openOnOther = args.positions.filter((p) => p.pair !== pair);
  if (!openOnOther.length) return [];

  const pairs = [...new Set([pair, ...openOnOther.map((p) => p.pair)])];
  const { matrix } = calculateCorrelationMatrix({
    candlesByPair: args.candlesByPair,
    pairs,
    window,
  });

  const syntheticProposed: Position = {
    id: 'sim-proposed',
    pair,
    algoId: 'sim',
    strategy: 'SIMULATED',
    side: args.proposedSide,
    units: 1,
    entry: 1,
    current: 1,
    stop: 0,
    trail: null,
    unrealizedPnl: 0,
    margin: 0,
    openedAt: Date.now(),
    status: 'ACTIVE',
  };

  const items: CorrelationContextItem[] = [];
  for (const pos of openOnOther) {
    const cell = correlationCell(matrix, pair, pos.pair);
    const correlation = cell?.sufficient ? cell.correlation : null;
    const relationship = classifyPositionRelationship(syntheticProposed, pos, correlation);
    items.push({
      pairA: pair,
      pairB: pos.pair,
      correlation,
      window,
      relationship,
      existingSide: pos.side,
      proposedSide: args.proposedSide,
    });
  }

  return items.sort((a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0));
}

export function compareBookMetrics(args: {
  current: BookMetrics;
  hypothetical: BookMetrics;
  positions: Position[];
  proposedPair?: string;
  proposedSide?: Side;
  candlesByPair?: Record<string, Candle[]>;
  correlationWindow?: CorrelationWindow;
}): BookComparisonResult {
  const cur = args.current;
  const hypo = args.hypothetical;

  const currencySet = new Set([
    ...cur.currencies.map((c) => c.currency),
    ...hypo.currencies.map((c) => c.currency),
  ]);

  const currencyShockEquityPct: Record<string, MetricTriple<number | null>> = {};
  const marginalCurrencyRisks: MarginalCurrencyRisk[] = [];

  for (const ccy of currencySet) {
    const beforeRow = cur.currencies.find((c) => c.currency === ccy);
    const afterRow = hypo.currencies.find((c) => c.currency === ccy);
    const beforePct = beforeRow?.adverseShockEquityPct ?? null;
    const afterPct = afterRow?.adverseShockEquityPct ?? null;
    const beforePnL = beforeRow?.adverseShockPnL ?? null;
    const afterPnL = afterRow?.adverseShockPnL ?? null;
    const marginalPnL = deltaNum(beforePnL, afterPnL);
    const marginalEquityPct = deltaNum(beforePct, afterPct);

    currencyShockEquityPct[ccy] = triple(beforePct, afterPct);
    marginalCurrencyRisks.push({
      currency: ccy,
      beforeEquityPct: beforePct,
      afterEquityPct: afterPct,
      marginalEquityPct,
      beforePnL,
      afterPnL,
      marginalPnL,
      label: formatMarginalRiskLabel(marginalPnL),
    });
  }

  marginalCurrencyRisks.sort(
    (a, b) => Math.abs(b.marginalPnL ?? 0) - Math.abs(a.marginalPnL ?? 0),
  );

  const riskDeltaEquityPct = worstShockRiskDelta({
    currentWorstEquityPct: cur.worstShockEquityPct,
    hypotheticalWorstEquityPct: hypo.worstShockEquityPct,
  });

  const correlationContext =
    args.proposedPair && args.proposedSide && args.candlesByPair
      ? buildCorrelationContext({
          positions: args.positions,
          proposedPair: args.proposedPair,
          proposedSide: args.proposedSide,
          candlesByPair: args.candlesByPair,
          correlationWindow: args.correlationWindow,
        })
      : [];

  return {
    current: cur,
    hypothetical: hypo,
    grossExposure: triple(cur.bookSummary.grossExposure, hypo.bookSummary.grossExposure),
    grossLeverage: triple(cur.bookSummary.grossLeverage, hypo.bookSummary.grossLeverage),
    worstShockEquityPct: triple(cur.worstShockEquityPct, hypo.worstShockEquityPct),
    currencyShockEquityPct,
    marginalCurrencyRisks,
    riskDeltaEquityPct,
    classification: classifyMarginalRisk(riskDeltaEquityPct),
    correlationContext,
  };
}

export function simulateBookChange(args: SimulateBookChangeArgs): SimulateBookChangeResult {
  const hypotheticalPositions = applyProposedChange(args.positions, args.change, args.quotes);

  const current = calculateBookMetrics({
    positions: args.positions,
    quotes: args.quotes,
    equity: args.equity,
    accountCurrency: args.accountCurrency,
    shockPercent: args.shockPercent,
    maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
  });

  const hypothetical = calculateBookMetrics({
    positions: hypotheticalPositions,
    quotes: args.quotes,
    equity: args.equity,
    accountCurrency: args.accountCurrency,
    shockPercent: args.shockPercent,
    maxCurrencyShockRiskPct: args.maxCurrencyShockRiskPct,
  });

  const comparison = compareBookMetrics({
    current,
    hypothetical,
    positions: args.positions,
    proposedPair: args.change.type === 'ADD_POSITION' ? args.change.pair : args.change.pair,
    proposedSide: args.change.side,
    candlesByPair: args.candlesByPair,
    correlationWindow: args.correlationWindow,
  });

  return { comparison };
}
