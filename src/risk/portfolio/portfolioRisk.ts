import type { CovarianceMatrix, PortfolioRiskSummary } from './types';
import type { PositionRiskProfile } from './types';

/**
 * Portfolio variance: wᵀ Σ w
 * w_i = signed dollar sensitivity per 1% pair move (account currency)
 * Σ_ij = covariance of 1H log returns
 * portfolio risk = sqrt(variance) in account-currency × return units
 *
 * Interpretation: expected absolute 1H P&L move scale (not a probability).
 */
export function calculatePortfolioVariance(args: {
  weights: number[];
  covariance: CovarianceMatrix;
  pairOrder: string[];
}): number | null {
  const n = args.pairOrder.length;
  if (n === 0) return null;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cov = args.covariance.covariances[args.pairOrder[i]]?.[args.pairOrder[j]];
      if (cov == null || !Number.isFinite(cov)) continue;
      variance += args.weights[i] * args.weights[j] * cov;
    }
  }
  return variance > 0 && Number.isFinite(variance) ? variance : variance === 0 ? 0 : null;
}

export function weightVectorFromProfiles(
  profiles: PositionRiskProfile[],
  pairOrder: string[],
): number[] {
  const byPair = new Map<string, number>();
  for (const p of profiles) {
    if (p.pairMoveSensitivity == null) continue;
    byPair.set(p.pair, (byPair.get(p.pair) ?? 0) + p.pairMoveSensitivity);
  }
  return pairOrder.map((pair) => byPair.get(pair) ?? 0);
}

export function calculatePortfolioRisk(args: {
  profiles: PositionRiskProfile[];
  covariance: CovarianceMatrix | null;
  equity: number;
}): PortfolioRiskSummary {
  const standaloneRisks = args.profiles
    .map((p) => p.standaloneOneHourRisk)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const grossStandaloneRisk = standaloneRisks.length
    ? standaloneRisks.reduce((s, v) => s + Math.abs(v), 0)
    : null;

  if (!args.covariance || args.covariance.pairs.length === 0) {
    return {
      grossStandaloneRisk,
      correlatedPortfolioRisk: null,
      diversificationBenefit: null,
      diversificationBenefitPercent: null,
      portfolioRiskPctOfEquity: null,
    };
  }

  const pairOrder = args.covariance.pairs;
  const weights = weightVectorFromProfiles(args.profiles, pairOrder);
  const variance = calculatePortfolioVariance({
    weights,
    covariance: args.covariance,
    pairOrder,
  });

  const correlatedPortfolioRisk =
    variance != null && variance >= 0 ? Math.sqrt(variance) : null;

  let diversificationBenefit: number | null = null;
  let diversificationBenefitPercent: number | null = null;
  if (grossStandaloneRisk != null && correlatedPortfolioRisk != null) {
    diversificationBenefit = Math.max(0, grossStandaloneRisk - correlatedPortfolioRisk);
    diversificationBenefitPercent =
      grossStandaloneRisk > 0 ? (diversificationBenefit / grossStandaloneRisk) * 100 : 0;
  }

  const portfolioRiskPctOfEquity =
    correlatedPortfolioRisk != null && args.equity > 0
      ? (correlatedPortfolioRisk / args.equity) * 100
      : null;

  return {
    grossStandaloneRisk,
    correlatedPortfolioRisk,
    diversificationBenefit,
    diversificationBenefitPercent,
    portfolioRiskPctOfEquity,
  };
}
