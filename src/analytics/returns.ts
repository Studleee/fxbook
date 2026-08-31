import type { Candle } from '../models';
import type { CorrelationWindow } from './types';

export const MIN_CORRELATION_OBSERVATIONS = 20;

/** Log returns — consistent with analytics layer. */
export function calculateReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) continue;
    const r = Math.log(cur / prev);
    if (Number.isFinite(r)) out.push(r);
    else out.push(NaN);
  }
  return out;
}

export interface WindowSpec {
  window: CorrelationWindow;
  /** Resample bucket size in seconds. */
  bucketSec: number;
  /** Calendar span to include (seconds). */
  windowSec: number;
  /** Max resampled bars after alignment. */
  maxBars: number;
  /** Minimum aligned return observations required. */
  minReturnObs: number;
  /** M5 candles to fetch when loading history from OANDA. */
  m5FetchCount: number;
  returnLabel: string;
  label: string;
}

export const CORRELATION_WINDOWS: WindowSpec[] = [
  {
    window: '24H',
    bucketSec: 900,
    windowSec: 86_400,
    maxBars: 96,
    minReturnObs: MIN_CORRELATION_OBSERVATIONS,
    m5FetchCount: 320,
    returnLabel: '15M',
    label: '24H',
  },
  {
    window: '7D',
    bucketSec: 3600,
    windowSec: 7 * 86_400,
    maxBars: 168,
    minReturnObs: MIN_CORRELATION_OBSERVATIONS,
    m5FetchCount: 2200,
    returnLabel: '1H',
    label: '7D',
  },
  {
    window: '30D',
    bucketSec: 14_400,
    windowSec: 30 * 86_400,
    maxBars: 180,
    minReturnObs: MIN_CORRELATION_OBSERVATIONS,
    m5FetchCount: 2200,
    returnLabel: '4H',
    label: '30D',
  },
  {
    window: '90D',
    bucketSec: 86_400,
    windowSec: 90 * 86_400,
    maxBars: 90,
    minReturnObs: MIN_CORRELATION_OBSERVATIONS,
    m5FetchCount: 2200,
    returnLabel: '1D',
    label: '90D',
  },
];

export function windowSpec(window: CorrelationWindow): WindowSpec {
  return CORRELATION_WINDOWS.find((w) => w.window === window) ?? CORRELATION_WINDOWS[0];
}

/** Sort chronologically and keep last candle per timestamp. */
export function normalizeCandles(candles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of candles) {
    if (!Number.isFinite(c.time) || !Number.isFinite(c.close) || c.close <= 0) continue;
    map.set(c.time, c);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/** Downsample to OHLC buckets using the last close in each bucket. */
export function resampleCandles(candles: Candle[], bucketSec: number): Candle[] {
  const norm = normalizeCandles(candles);
  if (!norm.length) return [];
  const buckets = new Map<number, Candle>();
  for (const c of norm) {
    const bucket = c.time - (c.time % bucketSec);
    buckets.set(bucket, { ...c, time: bucket });
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export interface AlignedReturnSeries {
  returnsA: number[];
  returnsB: number[];
  observationCount: number;
  timestamps: number[];
}

/**
 * Pairwise timestamp alignment: only periods present in both series.
 * Returns are computed on matched resampled closes (no index-only pairing).
 */
export function alignedReturnSeries(args: {
  candlesA: Candle[];
  candlesB: Candle[];
  spec: WindowSpec;
  nowSec?: number;
}): AlignedReturnSeries {
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const cutoff = nowSec - args.spec.windowSec;

  const resA = resampleCandles(args.candlesA, args.spec.bucketSec).filter((c) => c.time >= cutoff);
  const resB = resampleCandles(args.candlesB, args.spec.bucketSec).filter((c) => c.time >= cutoff);

  const mapA = new Map(resA.map((c) => [c.time, c.close]));
  const mapB = new Map(resB.map((c) => [c.time, c.close]));

  const common = [...mapA.keys()]
    .filter((t) => mapB.has(t))
    .sort((a, b) => a - b)
    .slice(-args.spec.maxBars);

  const closesA: number[] = [];
  const closesB: number[] = [];
  const timestamps: number[] = [];

  for (const t of common) {
    const a = mapA.get(t)!;
    const b = mapB.get(t)!;
    if (a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) {
      closesA.push(a);
      closesB.push(b);
      timestamps.push(t);
    }
  }

  if (closesA.length < 2) {
    return { returnsA: [], returnsB: [], observationCount: 0, timestamps: [] };
  }

  const returnsA: number[] = [];
  const returnsB: number[] = [];
  const returnTimes: number[] = [];

  for (let i = 1; i < closesA.length; i++) {
    const prevA = closesA[i - 1];
    const curA = closesA[i];
    const prevB = closesB[i - 1];
    const curB = closesB[i];
    if (prevA <= 0 || curA <= 0 || prevB <= 0 || curB <= 0) continue;
    const rA = Math.log(curA / prevA);
    const rB = Math.log(curB / prevB);
    if (!Number.isFinite(rA) || !Number.isFinite(rB)) continue;
    returnsA.push(rA);
    returnsB.push(rB);
    returnTimes.push(timestamps[i]);
  }

  return {
    returnsA,
    returnsB,
    observationCount: returnsA.length,
    timestamps: returnTimes,
  };
}

/** @deprecated Use alignedReturnSeries — kept for tests migrating from closes-only API. */
export function alignedCloses(
  candlesByPair: Record<string, Candle[]>,
  pairs: string[],
  maxBars: number,
): Record<string, number[]> {
  const active = pairs.filter((p) => (candlesByPair[p]?.length ?? 0) > 1);
  if (!active.length) return {};

  let common = new Set(candlesByPair[active[0]].map((c) => c.time));
  for (let i = 1; i < active.length; i++) {
    const times = new Set(candlesByPair[active[i]].map((c) => c.time));
    common = new Set([...common].filter((t) => times.has(t)));
  }

  const sorted = [...common].sort((a, b) => a - b).slice(-maxBars);
  const out: Record<string, number[]> = {};

  for (const pair of active) {
    const map = new Map(normalizeCandles(candlesByPair[pair]).map((c) => [c.time, c.close]));
    const closes: number[] = [];
    for (const t of sorted) {
      const c = map.get(t);
      if (c != null && c > 0) closes.push(c);
    }
    if (closes.length > 1) out[pair] = closes;
  }
  return out;
}

export function m5FetchCountForWindow(window: CorrelationWindow): number {
  return windowSpec(window).m5FetchCount;
}
