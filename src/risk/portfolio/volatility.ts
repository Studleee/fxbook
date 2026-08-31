import type { Candle } from '../../models';
import { calculateReturns, normalizeCandles, resampleCandles } from '../../analytics/returns';
import { stdDev } from '../../analytics/math';
import type { PairVolatilityMeta } from './types';

export const VOL_LOOKBACK_HOURS = 168; // 7 days of 1H bars
export const MIN_VOL_OBSERVATIONS = 20;
export const H1_BUCKET_SEC = 3600;

/**
 * 1-hour realized volatility = sample std dev of log returns on resampled H1 closes.
 * Lookback: 7 calendar days of 1H bars (up to 168 returns).
 */
export function calculatePairVolatility(args: {
  pair: string;
  candles: Candle[];
  nowSec?: number;
}): PairVolatilityMeta {
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const cutoff = nowSec - VOL_LOOKBACK_HOURS * H1_BUCKET_SEC;
  const resampled = resampleCandles(normalizeCandles(args.candles), H1_BUCKET_SEC).filter(
    (c) => c.time >= cutoff,
  );
  const closes = resampled.map((c) => c.close).filter((c) => c > 0 && Number.isFinite(c));
  const returns = calculateReturns(closes);
  const finite = returns.filter(Number.isFinite);
  const sampleCount = finite.length;
  const volatility =
    sampleCount >= MIN_VOL_OBSERVATIONS ? stdDev(finite) : null;

  return {
    pair: args.pair,
    lookbackHours: VOL_LOOKBACK_HOURS,
    sampleCount,
    volatility,
    lastUpdated: nowSec * 1000,
  };
}

export function volatilityMap(
  pairs: string[],
  candlesByPair: Record<string, Candle[]>,
  nowSec?: number,
): Record<string, PairVolatilityMeta> {
  const out: Record<string, PairVolatilityMeta> = {};
  for (const pair of pairs) {
    out[pair] = calculatePairVolatility({
      pair,
      candles: candlesByPair[pair] ?? [],
      nowSec,
    });
  }
  return out;
}
