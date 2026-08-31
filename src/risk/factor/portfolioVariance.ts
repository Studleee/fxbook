import type { PortfolioVarianceResult } from './types';
import type { FactorCovarianceMatrix } from './types';

/**
 * Portfolio variance: x^T F x + specificRiskVariance
 * x = account-currency factor exposures
 * F = factor return covariance (1H horizon)
 */
export function calculateFactorPortfolioVariance(args: {
  exposures: (number | null)[];
  covariance: FactorCovarianceMatrix;
  equity: number;
  specificRiskVariance?: number;
}): PortfolioVarianceResult {
  const n = args.covariance.factors.length;
  const specific = args.specificRiskVariance ?? 0;
  let variance = specific;

  for (let i = 0; i < n; i++) {
    const xi = args.exposures[i];
    if (xi == null || !Number.isFinite(xi)) continue;
    for (let j = 0; j < n; j++) {
      const xj = args.exposures[j];
      if (xj == null || !Number.isFinite(xj)) continue;
      const cov = args.covariance.covariances[i]?.[j];
      if (cov == null || !Number.isFinite(cov)) continue;
      variance += xi * xj * cov;
    }
  }

  if (!Number.isFinite(variance) || variance < 0) {
    return {
      variance: null,
      portfolioVol: null,
      portfolioVolPct: null,
      specificRiskVariance: specific,
    };
  }

  const portfolioVol = Math.sqrt(variance);
  const portfolioVolPct =
    args.equity > 0 ? (portfolioVol / args.equity) * 100 : null;

  return {
    variance,
    portfolioVol,
    portfolioVolPct,
    specificRiskVariance: specific,
  };
}

/** Scale 1H factor covariance to multi-day horizon (iid). */
export function scaleCovarianceHorizon(
  matrix: FactorCovarianceMatrix,
  horizonDays: number,
  hoursPerDay = 24,
): FactorCovarianceMatrix {
  const scale = horizonDays * hoursPerDay;
  return {
    ...matrix,
    covariances: matrix.covariances.map((row) => row.map((v) => v * scale)),
    volatilities: matrix.volatilities.map((v) =>
      Number.isFinite(v) ? v * Math.sqrt(scale) : v,
    ),
  };
}
