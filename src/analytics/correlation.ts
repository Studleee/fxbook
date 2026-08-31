import type { Candle, Position } from '../models';
import {
  alignedReturnSeries,
  MIN_CORRELATION_OBSERVATIONS,
  windowSpec,
  type WindowSpec,
} from './returns';
import type {
  CorrelationCell,
  CorrelationDirection,
  CorrelationSelection,
  CorrelationStrength,
  CorrelationWindow,
} from './types';
import { finiteOrNull, mean, stdDev } from './math';

export interface CorrelationMatrixResult {
  matrix: CorrelationCell[];
  pairs: string[];
  spec: WindowSpec;
  minObservations: number;
}

/** Pearson correlation on equal-length return series with NaN rejection. */
export function calculateCorrelation(returnsA: number[], returnsB: number[]): number | null {
  const paired: { a: number; b: number }[] = [];
  const n = Math.min(returnsA.length, returnsB.length);
  for (let i = 0; i < n; i++) {
    const a = returnsA[i];
    const b = returnsB[i];
    if (Number.isFinite(a) && Number.isFinite(b)) paired.push({ a, b });
  }
  if (paired.length < MIN_CORRELATION_OBSERVATIONS) return null;

  const a = paired.map((p) => p.a);
  const b = paired.map((p) => p.b);
  const ma = mean(a);
  const mb = mean(b);
  const sa = stdDev(a);
  const sb = stdDev(b);
  if (ma == null || mb == null || sa == null || sb == null || sa < 1e-12 || sb < 1e-12) return null;

  let cov = 0;
  for (let i = 0; i < paired.length; i++) {
    cov += (paired[i].a - ma) * (paired[i].b - mb);
  }
  cov /= paired.length - 1;
  return finiteOrNull(cov / (sa * sb));
}

export function correlationStrength(absCorrelation: number): CorrelationStrength {
  const abs = Math.abs(absCorrelation);
  if (abs >= 0.8) return 'EXTREME';
  if (abs >= 0.6) return 'STRONG';
  if (abs >= 0.3) return 'MODERATE';
  return 'WEAK';
}

export function correlationDirection(correlation: number | null): CorrelationDirection {
  if (correlation == null) return 'N/A';
  if (correlation > 0) return 'POSITIVE';
  if (correlation < 0) return 'NEGATIVE';
  return 'NEUTRAL';
}

export function strengthLabel(correlation: number | null): string {
  if (correlation == null) return 'N/A';
  const strength = correlationStrength(correlation);
  const direction = correlationDirection(correlation);
  if (direction === 'N/A' || direction === 'NEUTRAL') return strength;
  return `${strength} ${direction}`;
}

/**
 * Whether two open positions reinforce or offset given return correlation.
 * Positive ρ: same side reinforces. Negative ρ: opposite sides reinforce.
 */
export function classifyPositionRelationship(
  posA: Position | undefined,
  posB: Position | undefined,
  correlation: number | null,
): CorrelationSelection['relationship'] {
  if (!posA || !posB) return 'NOT BOTH OPEN';
  if (correlation == null || Math.abs(correlation) < 0.3) return 'MIXED / NEUTRAL';

  const sameSide = posA.side === posB.side;
  if (correlation > 0) return sameSide ? 'REINFORCING' : 'OFFSETTING';
  return sameSide ? 'OFFSETTING' : 'REINFORCING';
}

export function classifyPortfolioRisk(
  relationship: CorrelationSelection['relationship'],
  correlation: number | null,
): CorrelationSelection['riskLevel'] {
  if (relationship === 'NOT BOTH OPEN' || relationship === 'MIXED / NEUTRAL') return 'N/A';
  if (correlation == null) return 'N/A';
  const abs = Math.abs(correlation);
  if (relationship === 'REINFORCING' && abs >= 0.75) return 'HIGH';
  if (relationship === 'REINFORCING' && abs >= 0.55) return 'MEDIUM';
  if (abs >= 0.6) return 'MEDIUM';
  return 'LOW';
}

export function calculateCorrelationMatrix(args: {
  candlesByPair: Record<string, Candle[]>;
  pairs: string[];
  window: CorrelationWindow;
  nowSec?: number;
}): CorrelationMatrixResult {
  const spec = windowSpec(args.window);
  const activePairs = args.pairs.filter((p) => (args.candlesByPair[p]?.length ?? 0) > 1);

  const matrix: CorrelationCell[] = [];
  for (const pairA of activePairs) {
    for (const pairB of activePairs) {
      if (pairA === pairB) {
        matrix.push({
          pairA,
          pairB,
          correlation: 1,
          observationCount: 0,
          window: args.window,
          returnTimeframe: spec.returnLabel,
          sufficient: true,
          isDiagonal: true,
        });
        continue;
      }

      const aligned = alignedReturnSeries({
        candlesA: args.candlesByPair[pairA] ?? [],
        candlesB: args.candlesByPair[pairB] ?? [],
        spec,
        nowSec: args.nowSec,
      });

      const sufficient = aligned.observationCount >= spec.minReturnObs;
      const correlation = sufficient
        ? calculateCorrelation(aligned.returnsA, aligned.returnsB)
        : null;

      matrix.push({
        pairA,
        pairB,
        correlation,
        observationCount: aligned.observationCount,
        window: args.window,
        returnTimeframe: spec.returnLabel,
        sufficient: sufficient && correlation != null,
        isDiagonal: false,
      });
    }
  }

  const pairs = activePairs.filter((p) =>
    matrix.some(
      (c) =>
        (c.pairA === p || c.pairB === p) &&
        (c.isDiagonal || (c.sufficient && c.correlation != null)),
    ),
  );

  return {
    matrix,
    pairs: pairs.length ? pairs : activePairs,
    spec,
    minObservations: spec.minReturnObs,
  };
}

export function correlationCell(
  matrix: CorrelationCell[],
  pairA: string,
  pairB: string,
): CorrelationCell | null {
  if (pairA === pairB) {
    const diag = matrix.find((c) => c.pairA === pairA && c.pairB === pairB && c.isDiagonal);
    return diag ?? null;
  }
  return (
    matrix.find(
      (c) =>
        !c.isDiagonal &&
        ((c.pairA === pairA && c.pairB === pairB) || (c.pairA === pairB && c.pairB === pairA)),
    ) ?? null
  );
}

export function correlationAt(matrix: CorrelationCell[], pairA: string, pairB: string): number | null {
  const cell = correlationCell(matrix, pairA, pairB);
  if (!cell || cell.isDiagonal) return cell?.isDiagonal ? 1 : null;
  return cell.sufficient && cell.correlation != null ? finiteOrNull(cell.correlation) : null;
}

export function describeCorrelationExposure(args: {
  pairA: string;
  pairB: string;
  cell: CorrelationCell | null;
  positions: Position[];
}): CorrelationSelection | null {
  if (!args.cell || args.cell.isDiagonal) return null;
  const posA = args.positions.find((p) => p.pair === args.pairA);
  const posB = args.positions.find((p) => p.pair === args.pairB);
  const correlation = args.cell.sufficient ? args.cell.correlation : null;
  const relationship = classifyPositionRelationship(posA, posB, correlation);
  const riskLevel = classifyPortfolioRisk(relationship, correlation);

  return {
    pairA: args.pairA,
    pairB: args.pairB,
    correlation,
    observationCount: args.cell.observationCount,
    window: args.cell.window,
    returnTimeframe: args.cell.returnTimeframe,
    strength: correlation != null ? correlationStrength(correlation) : 'N/A',
    direction: correlationDirection(correlation),
    bothOpen: Boolean(posA && posB),
    relationship,
    riskLevel,
    positionA: posA ?? null,
    positionB: posB ?? null,
  };
}
