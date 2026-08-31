import type { Candle } from '../../models';
import { alignedReturnSeries, windowSpec } from '../../analytics/returns';
import { calculateCorrelation } from '../../analytics/correlation';
import type { CovarianceMatrix } from './types';

/**
 * Build covariance matrix from 1H return correlations and volatilities.
 * cov_ij = corr_ij × σ_i × σ_j on aligned 1H log returns (7D window).
 */
export function buildCovarianceMatrix(args: {
  pairs: string[];
  candlesByPair: Record<string, Candle[]>;
  volatilities: Record<string, number | null>;
  nowSec?: number;
}): CovarianceMatrix | null {
  const pairs = args.pairs.filter((p) => (args.candlesByPair[p]?.length ?? 0) > 1);
  if (pairs.length < 1) return null;

  const spec = windowSpec('7D'); // 1H returns, 7D span
  const correlations: Record<string, Record<string, number | null>> = {};
  const covariances: Record<string, Record<string, number | null>> = {};
  let minObs = Infinity;

  for (const pairA of pairs) {
    correlations[pairA] = {};
    covariances[pairA] = {};
    for (const pairB of pairs) {
      if (pairA === pairB) {
        correlations[pairA][pairB] = 1;
        const vol = args.volatilities[pairA];
        covariances[pairA][pairB] = vol != null ? vol * vol : null;
        continue;
      }
      const aligned = alignedReturnSeries({
        candlesA: args.candlesByPair[pairA] ?? [],
        candlesB: args.candlesByPair[pairB] ?? [],
        spec,
        nowSec: args.nowSec,
      });
      minObs = Math.min(minObs, aligned.observationCount);
      const corr =
        aligned.observationCount >= spec.minReturnObs
          ? calculateCorrelation(aligned.returnsA, aligned.returnsB)
          : null;
      correlations[pairA][pairB] = corr;
      const volA = args.volatilities[pairA];
      const volB = args.volatilities[pairB];
      covariances[pairA][pairB] =
        corr != null && volA != null && volB != null ? corr * volA * volB : null;
    }
  }

  return {
    pairs,
    volatilities: Object.fromEntries(pairs.map((p) => [p, args.volatilities[p] ?? null])),
    correlations,
    covariances,
    observationCount: Number.isFinite(minObs) ? minObs : 0,
  };
}
