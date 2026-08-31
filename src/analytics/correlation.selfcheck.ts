/**
 * Correlation utility self-check.
 * Run: npm run test:corr
 */
import type { Candle } from '../models';
import {
  calculateCorrelation,
  calculateCorrelationMatrix,
  correlationCell,
} from './correlation';
import { alignedReturnSeries, calculateReturns, normalizeCandles, windowSpec } from './returns';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function approx(a: number | null, b: number, eps = 0.02) {
  return a != null && Math.abs(a - b) <= eps;
}

function makeCandles(closes: number[], start = 1_700_000_000, step = 300): Candle[] {
  return closes.map((close, i) => ({
    time: start + i * step,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

// Perfect positive correlation
{
  const base = Array.from({ length: 40 }, (_, i) => 1 + i * 0.001);
  const a = calculateReturns(base);
  const b = calculateReturns(base.map((v) => v * 2 + 0.5));
  assert(approx(calculateCorrelation(a, b), 1), 'perfect positive');
}

// Perfect negative correlation (inverted returns)
{
  const base = Array.from({ length: 40 }, (_, i) => 0.01 * Math.sin(i / 3));
  const a = base;
  const b = base.map((v) => -v);
  assert(approx(calculateCorrelation(a, b), -1), 'perfect negative');
}

// Uncorrelated-ish synthetic
{
  const a = Array.from({ length: 60 }, (_, i) => Math.sin(i / 3) * 0.01);
  const b = Array.from({ length: 60 }, (_, i) => Math.cos(i / 5) * 0.01);
  const c = calculateCorrelation(a, b);
  assert(c != null && Math.abs(c) < 0.35, 'uncorrelated synthetic');
}

// Insufficient observations
{
  const a = [0.01, -0.01, 0.02];
  const b = [0.01, -0.02, 0.01];
  assert(calculateCorrelation(a, b) === null, 'insufficient observations');
}

// Zero variance
{
  const a = Array.from({ length: 30 }, () => 0.01);
  const b = Array.from({ length: 30 }, (_, i) => 0.01 + i * 0.0001);
  assert(calculateCorrelation(a, b) === null, 'zero variance series');
}

// NaN rejection
{
  const a = Array.from({ length: 30 }, (_, i) => (i === 10 ? NaN : 0.01 * Math.sin(i)));
  const b = Array.from({ length: 30 }, (_, i) => 0.01 * Math.cos(i));
  const cleanA = a.filter(Number.isFinite);
  const cleanB = b.slice(0, cleanA.length);
  const c = calculateCorrelation(cleanA, cleanB);
  assert(c == null || Number.isFinite(c), 'NaN handled');
}

// Timestamp alignment — different ranges should not index-match blindly
{
  const spec = windowSpec('24H');
  const seriesA = makeCandles(Array.from({ length: 30 }, (_, i) => 1.1 + i * 0.0001), 1_000_000, 900);
  const seriesB = makeCandles(Array.from({ length: 30 }, (_, i) => 1.2 + i * 0.0001), 2_000_000, 900);
  const aligned = alignedReturnSeries({
    candlesA: seriesA,
    candlesB: seriesB,
    spec,
    nowSec: 2_100_000,
  });
  assert(aligned.observationCount === 0, 'non-overlapping timestamps yield 0 obs');
}

// Misordered timestamps normalized
{
  const messy = makeCandles([1.1, 1.11, 1.12, 1.13], 1000, 900);
  messy[0].time = 3700;
  const norm = normalizeCandles(messy);
  assert(norm[0].time < norm[norm.length - 1].time, 'timestamps sorted');
}

// Matrix metadata + N/A for short history
{
  const short = makeCandles([1.1, 1.11, 1.12], 2_000_000, 900);
  const matrix = calculateCorrelationMatrix({
    candlesByPair: { 'EUR/USD': short, 'GBP/USD': short },
    pairs: ['EUR/USD', 'GBP/USD'],
    window: '24H',
    nowSec: 2_100_000,
  });
  const cell = correlationCell(matrix.matrix, 'EUR/USD', 'GBP/USD');
  assert(cell != null && !cell.sufficient, 'short history marks insufficient');
  assert(cell?.correlation == null, 'insufficient does not emit numeric correlation');
}

// Identical return series ~ +1 in matrix path
{
  const nowSec = 2_000_000;
  const closes = Array.from({ length: 60 }, (_, i) => 1 + Math.sin(i / 4) * 0.02 + i * 0.0001);
  const candles = makeCandles(closes, nowSec - 60 * 900, 900);
  const matrix = calculateCorrelationMatrix({
    candlesByPair: { 'EUR/USD': candles, 'GBP/USD': candles },
    pairs: ['EUR/USD', 'GBP/USD'],
    window: '24H',
    nowSec,
  });
  const cell = correlationCell(matrix.matrix, 'EUR/USD', 'GBP/USD');
  assert(cell != null && cell.sufficient && approx(cell.correlation, 1), 'identical series ~ +1');
}

console.log(`correlation self-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
