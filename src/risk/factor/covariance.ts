import { stdDev } from '../../analytics/math';
import {
  FACTOR_COV_EWMA_LAMBDA,
  FACTOR_COV_LOOKBACK_DAYS,
  FACTOR_COV_MIN_OBS,
} from './constants';
import type { FactorReturnSeries } from './factorReturns';
import type { FactorCovarianceMatrix, MatrixHealth } from './types';

function sampleCovariance(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < FACTOR_COV_MIN_OBS) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
    xs.push(a[i]);
    ys.push(b[i]);
  }
  if (xs.length < FACTOR_COV_MIN_OBS) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let cov = 0;
  for (let i = 0; i < xs.length; i++) cov += (xs[i] - mx) * (ys[i] - my);
  return cov / (xs.length - 1);
}

function ewmaCovariance(a: number[], b: number[], lambda: number): number | null {
  const n = Math.min(a.length, b.length);
  if (n < FACTOR_COV_MIN_OBS) return null;
  let meanA = 0;
  let meanB = 0;
  let weightSum = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
    const w = Math.pow(lambda, n - 1 - i);
    meanA += w * a[i];
    meanB += w * b[i];
    weightSum += w;
  }
  if (weightSum <= 0) return null;
  meanA /= weightSum;
  meanB /= weightSum;

  let cov = 0;
  let covWeight = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
    const w = Math.pow(lambda, n - 1 - i);
    cov += w * (a[i] - meanA) * (b[i] - meanB);
    covWeight += w;
  }
  return covWeight > 1 ? cov / (covWeight - 1) : null;
}

function regularizeDiagonal(matrix: number[][], floor: number): MatrixHealth {
  let adjusted = false;
  for (let i = 0; i < matrix.length; i++) {
    const v = matrix[i][i];
    if (!Number.isFinite(v) || v < floor) {
      matrix[i][i] = Math.max(floor, v > 0 ? v : floor);
      adjusted = true;
    }
  }
  return adjusted ? 'REGULARIZED' : 'OK';
}

export function buildFactorCovarianceMatrix(args: {
  factorSeries: FactorReturnSeries;
  method?: 'ROLLING' | 'EWMA';
  ewmaLambda?: number;
  nowMs?: number;
}): FactorCovarianceMatrix | null {
  const factors = args.factorSeries.factors;
  const n = factors.length;
  const method = args.method ?? 'ROLLING';
  const lambda = args.ewmaLambda ?? FACTOR_COV_EWMA_LAMBDA;

  const covariances: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const correlations: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const volatilities: number[] = Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ri = args.factorSeries.returnsByFactor[i];
      const rj = args.factorSeries.returnsByFactor[j];
      const cov =
        method === 'EWMA'
          ? ewmaCovariance(ri, rj, lambda)
          : sampleCovariance(ri, rj);
      covariances[i][j] = cov ?? 0;
    }
    const vol = stdDev(args.factorSeries.returnsByFactor[i].filter(Number.isFinite));
    volatilities[i] = vol ?? NaN;
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const vi = volatilities[i];
      const vj = volatilities[j];
      if (vi > 0 && vj > 0 && Number.isFinite(covariances[i][j])) {
        correlations[i][j] = covariances[i][j] / (vi * vj);
      } else if (i === j) {
        correlations[i][j] = 1;
      }
    }
  }

  const minVol = Math.min(...volatilities.filter((v) => v > 0 && Number.isFinite(v)));
  const floor = Number.isFinite(minVol) && minVol > 0 ? minVol * minVol * 1e-4 : 1e-12;
  const health = regularizeDiagonal(covariances, floor);

  if (args.factorSeries.observationCount < FACTOR_COV_MIN_OBS) {
    return null;
  }

  return {
    factors,
    covariances,
    correlations,
    volatilities,
    observationCount: args.factorSeries.observationCount,
    lookbackDays: args.factorSeries.lookbackDays ?? FACTOR_COV_LOOKBACK_DAYS,
    method,
    matrixHealth: health,
    lastUpdated: args.nowMs ?? Date.now(),
  };
}

export function covarianceMetadataFrom(matrix: FactorCovarianceMatrix): import('./types').CovarianceMetadata {
  return {
    lookbackDays: matrix.lookbackDays,
    observations: matrix.observationCount,
    lastUpdated: matrix.lastUpdated,
    method: matrix.method,
    matrixHealth: matrix.matrixHealth,
    factors: matrix.factors,
  };
}
