import type { FactorCovarianceMatrix, FactorRiskContribution } from './types';

/**
 * Component variance contributions:
 *   marginal_i = (F x)_i
 *   component_i = x_i * marginal_i
 * Normalized pct_i = component_i / portfolioVariance * 100
 */
export function calculateFactorRiskContributions(args: {
  exposures: (number | null)[];
  covariance: FactorCovarianceMatrix;
  portfolioVariance: number;
}): FactorRiskContribution[] {
  const n = args.covariance.factors.length;
  const marginal: (number | null)[] = [];

  for (let i = 0; i < n; i++) {
    const xi = args.exposures[i];
    if (xi == null || !Number.isFinite(xi)) {
      marginal.push(null);
      continue;
    }
    let m = 0;
    for (let j = 0; j < n; j++) {
      const xj = args.exposures[j];
      if (xj == null || !Number.isFinite(xj)) continue;
      const cov = args.covariance.covariances[i]?.[j];
      if (cov == null || !Number.isFinite(cov)) continue;
      m += cov * xj;
    }
    marginal.push(m);
  }

  return args.covariance.factors.map((factor, i) => {
    const xi = args.exposures[i];
    const mi = marginal[i];
    const vol = args.covariance.volatilities[i];
    const componentVariance =
      xi != null && mi != null && Number.isFinite(xi) && Number.isFinite(mi)
        ? xi * mi
        : null;
    const riskContributionPct =
      componentVariance != null &&
      args.portfolioVariance > 0 &&
      Number.isFinite(componentVariance)
        ? (componentVariance / args.portfolioVariance) * 100
        : null;

    return {
      factor,
      marginalRisk: mi,
      componentVariance,
      riskContributionPct,
      currentVol: Number.isFinite(vol) ? vol : null,
      forecastVol: Number.isFinite(vol) ? vol : null,
      volChangePct: null,
    };
  });
}

export function largestRiskFactor(contributions: FactorRiskContribution[]): string | null {
  let best: FactorRiskContribution | null = null;
  for (const c of contributions) {
    const pct = c.riskContributionPct;
    if (pct == null || !Number.isFinite(pct)) continue;
    if (!best || Math.abs(pct) > Math.abs(best.riskContributionPct ?? 0)) best = c;
  }
  return best?.factor ?? null;
}

export function sumRiskContributions(contributions: FactorRiskContribution[]): number {
  return contributions.reduce((s, c) => s + (c.riskContributionPct ?? 0), 0);
}
