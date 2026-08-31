import type { CovarianceMatrix, PositionRiskContribution, PositionRiskProfile } from './types';
import { weightVectorFromProfiles } from './portfolioRisk';

/**
 * Euler (component) risk contribution:
 * CR_i = w_i × (Σw)_i / σ_p
 * Can be negative when the position hedges the book.
 */
export function calculateMarginalRiskContribution(args: {
  weights: number[];
  covariance: CovarianceMatrix;
  pairOrder: string[];
  index: number;
  portfolioRisk: number;
}): number | null {
  if (args.portfolioRisk <= 0 || !Number.isFinite(args.portfolioRisk)) return null;
  const pair = args.pairOrder[args.index];
  let sigmaW = 0;
  for (let j = 0; j < args.pairOrder.length; j++) {
    const cov = args.covariance.covariances[pair]?.[args.pairOrder[j]];
    if (cov == null) continue;
    sigmaW += cov * args.weights[j];
  }
  return (args.weights[args.index] * sigmaW) / args.portfolioRisk;
}

export function calculateComponentRiskContributions(args: {
  profiles: PositionRiskProfile[];
  covariance: CovarianceMatrix | null;
  pairOrder: string[];
  portfolioRisk: number | null;
}): Map<string, number> {
  const out = new Map<string, number>();
  if (!args.covariance || args.portfolioRisk == null || args.portfolioRisk <= 0) return out;

  const weights = weightVectorFromProfiles(args.profiles, args.pairOrder);
  for (let i = 0; i < args.pairOrder.length; i++) {
    const cr = calculateMarginalRiskContribution({
      weights,
      covariance: args.covariance,
      pairOrder: args.pairOrder,
      index: i,
      portfolioRisk: args.portfolioRisk,
    });
    if (cr != null) out.set(args.pairOrder[i], cr);
  }
  return out;
}

export function buildPositionRiskContributions(args: {
  profiles: PositionRiskProfile[];
  covariance: CovarianceMatrix | null;
  portfolioRisk: number | null;
  equity: number;
  stopRiskByPosition: Map<string, number | null>;
}): PositionRiskContribution[] {
  const pairOrder = args.covariance?.pairs ?? [...new Set(args.profiles.map((p) => p.pair))];
  const componentByPair = calculateComponentRiskContributions({
    profiles: args.profiles,
    covariance: args.covariance,
    pairOrder,
    portfolioRisk: args.portfolioRisk,
  });

  const totalAbsComponent = [...componentByPair.values()].reduce(
    (s, v) => s + Math.abs(v),
    0,
  );

  return args.profiles.map((p) => {
    const component = componentByPair.get(p.pair) ?? null;
    const portfolioContributionPct =
      component != null && totalAbsComponent > 0
        ? (component / totalAbsComponent) * 100
        : null;
    const stopRisk = args.stopRiskByPosition.get(p.positionId) ?? null;
    return {
      positionId: p.positionId,
      pair: p.pair,
      side: p.direction,
      units: p.units,
      oneHourVolatility: p.oneHourVolatility,
      standaloneRisk: p.standaloneOneHourRisk,
      portfolioContribution: component,
      portfolioContributionPct,
      stopRisk,
      stopRiskPctEquity:
        stopRisk != null && args.equity > 0 ? (Math.abs(stopRisk) / args.equity) * 100 : null,
      hasStop: p.hardStop != null && p.hardStop > 0,
    };
  });
}
