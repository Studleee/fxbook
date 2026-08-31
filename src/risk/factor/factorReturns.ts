import type { Candle } from '../../models';
import { splitPair } from '../../fx/pips';
import { calculateReturns, normalizeCandles, resampleCandles } from '../../analytics/returns';
import {
  FACTOR_COV_BUCKET_SEC,
  FACTOR_COV_LOOKBACK_DAYS,
  FACTOR_COV_MIN_OBS,
} from './constants';

export interface FactorReturnSeries {
  factors: string[];
  timestamps: number[];
  /** factor index → return series aligned to timestamps[1..] */
  returnsByFactor: number[][];
  observationCount: number;
  lookbackDays: number;
  bucketSec: number;
}

/**
 * Estimate factor log-return series from pair candles.
 * For pair A/B: r_AB ≈ r_A − r_B → accumulate implied factor returns per bucket.
 */
export function buildFactorReturnSeries(args: {
  factors: string[];
  pairs: string[];
  candlesByPair: Record<string, Candle[]>;
  bucketSec?: number;
  lookbackDays?: number;
  nowSec?: number;
}): FactorReturnSeries | null {
  const bucketSec = args.bucketSec ?? FACTOR_COV_BUCKET_SEC;
  const lookbackDays = args.lookbackDays ?? FACTOR_COV_LOOKBACK_DAYS;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const cutoff = nowSec - lookbackDays * 86_400;

  const pairReturns = new Map<string, { times: number[]; returns: number[] }>();
  for (const pair of args.pairs) {
    const candles = resampleCandles(normalizeCandles(args.candlesByPair[pair] ?? []), bucketSec).filter(
      (c) => c.time >= cutoff,
    );
    if (candles.length < 2) continue;
    const closes = candles.map((c) => c.close);
    const rets = calculateReturns(closes);
    pairReturns.set(pair, {
      times: candles.slice(1).map((c) => c.time),
      returns: rets,
    });
  }

  if (!pairReturns.size) return null;

  const timeSet = new Set<number>();
  for (const { times } of pairReturns.values()) {
    for (const t of times) timeSet.add(t);
  }
  const timestamps = [...timeSet].sort((a, b) => a - b);
  if (timestamps.length < FACTOR_COV_MIN_OBS + 1) return null;

  const factorIdx = new Map(args.factors.map((f, i) => [f, i]));
  const accum: number[][] = args.factors.map(() => []);
  const counts: number[][] = args.factors.map(() => []);

  for (let ti = 0; ti < timestamps.length; ti++) {
    const t = timestamps[ti];
    for (let fi = 0; fi < args.factors.length; fi++) {
      accum[fi][ti] = 0;
      counts[fi][ti] = 0;
    }

    for (const [pair, { times, returns }] of pairReturns) {
      const idx = times.indexOf(t);
      if (idx < 0) continue;
      const r = returns[idx];
      if (!Number.isFinite(r)) continue;
      const [base, quote] = splitPair(pair);
      const bi = factorIdx.get(base);
      const qi = factorIdx.get(quote);
      if (bi != null) {
        accum[bi][ti] += r;
        counts[bi][ti] += 1;
      }
      if (qi != null) {
        accum[qi][ti] -= r;
        counts[qi][ti] += 1;
      }
    }
  }

  const returnsByFactor: number[][] = args.factors.map((_, fi) => {
    const out: number[] = [];
    for (let ti = 0; ti < timestamps.length; ti++) {
      const c = counts[fi][ti];
      out.push(c > 0 ? accum[fi][ti] / c : NaN);
    }
    return out;
  });

  const validRows = timestamps.filter((_, ti) =>
    returnsByFactor.some((series) => Number.isFinite(series[ti])),
  ).length;

  if (validRows < FACTOR_COV_MIN_OBS) return null;

  return {
    factors: args.factors,
    timestamps,
    returnsByFactor,
    observationCount: validRows,
    lookbackDays,
    bucketSec,
  };
}

/** Portfolio log-return series: r_p(t) ≈ Σ e_i r_i(t) / equity */
export function buildPortfolioReturnSeries(args: {
  factorSeries: FactorReturnSeries;
  exposures: number[];
  equity: number;
}): number[] {
  if (args.equity <= 0) return [];
  const out: number[] = [];
  const n = args.factorSeries.timestamps.length;
  for (let t = 0; t < n; t++) {
    let r = 0;
    let used = false;
    for (let i = 0; i < args.exposures.length; i++) {
      const ret = args.factorSeries.returnsByFactor[i]?.[t];
      if (!Number.isFinite(ret)) continue;
      r += args.exposures[i] * ret;
      used = true;
    }
    out.push(used ? r / args.equity : NaN);
  }
  return out.filter(Number.isFinite);
}
