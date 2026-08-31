/**
 * Factor risk engine validation.
 * Run: npm run test:factor
 */
import type { Candle, Position } from '../../models';
import { INITIAL_QUOTES } from '../../mock/seed';
import { splitPair } from '../../fx/pips';
import { buildFactorExposures } from './exposure';
import { buildFactorReturnSeries } from './factorReturns';
import { buildFactorCovarianceMatrix } from './covariance';
import { calculateFactorPortfolioVariance } from './portfolioVariance';
import {
  calculateFactorRiskContributions,
  sumRiskContributions,
} from './riskContribution';
import { calculateParametricVaR } from './varEngine';
import { calculateRiskSnapshot } from './riskSnapshot';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function approx(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}

const pos = (
  partial: Partial<Position> & Pick<Position, 'pair' | 'side' | 'units' | 'entry' | 'current'>,
): Position => ({
  id: 't1',
  algoId: 'a',
  strategy: 'T',
  stop: 0,
  trail: null,
  unrealizedPnl: 0,
  margin: 1,
  openedAt: Date.now(),
  status: 'ACTIVE',
  ...partial,
});

function syntheticCandles(pair: string, base: number, n: number, drift = 0.0001): Candle[] {
  const out: Candle[] = [];
  let px = base;
  const start = Math.floor(Date.now() / 1000) - n * 3600;
  for (let i = 0; i < n; i++) {
    const noise = Math.sin(i * 0.7 + pair.length) * 0.002 + drift * (i % 3 === 0 ? 1 : -1);
    const open = px;
    px = px * (1 + noise);
    out.push({
      time: start + i * 3600,
      open,
      high: Math.max(open, px) * 1.0002,
      low: Math.min(open, px) * 0.9998,
      close: px,
    });
  }
  return out;
}

function candleMapForPairs(pairs: string[], n = 80): Record<string, Candle[]> {
  const bases: Record<string, number> = {
    'EUR/USD': 1.085,
    'USD/CAD': 1.384,
    'GBP/USD': 1.29,
    'AUD/JPY': 97.45,
  };
  const map: Record<string, Candle[]> = {};
  for (const p of pairs) {
    map[p] = syntheticCandles(p, bases[p] ?? 1.1, n);
  }
  return map;
}

// Single EURUSD long — EUR positive, USD negative native
{
  const positions = [
    pos({ id: 'p1', pair: 'EUR/USD', side: 'LONG', units: 100, entry: 1.1, current: 1.1 }),
  ];
  const exposures = buildFactorExposures({
    positions,
    quotes: INITIAL_QUOTES,
    accountCurrency: 'USD',
  });
  const eur = exposures.find((e) => e.factor === 'EUR');
  const usd = exposures.find((e) => e.factor === 'USD');
  assert(eur != null && eur.netNative > 0, 'long EUR/USD → positive EUR native');
  assert(usd != null && usd.netNative < 0, 'long EUR/USD → negative USD native');
}

// Single EURUSD short inverts
{
  const positions = [
    pos({ id: 'p1', pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 }),
  ];
  const exposures = buildFactorExposures({
    positions,
    quotes: INITIAL_QUOTES,
    accountCurrency: 'USD',
  });
  const eur = exposures.find((e) => e.factor === 'EUR');
  assert(eur != null && eur.netNative < 0, 'short EUR/USD → negative EUR');
}

// Offsetting EURUSD positions net near zero
{
  const positions = [
    pos({ id: 'p1', pair: 'EUR/USD', side: 'LONG', units: 100, entry: 1.1, current: 1.1 }),
    pos({ id: 'p2', pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 }),
  ];
  const exposures = buildFactorExposures({
    positions,
    quotes: INITIAL_QUOTES,
    accountCurrency: 'USD',
  });
  const eur = exposures.find((e) => e.factor === 'EUR');
  assert(eur != null && Math.abs(eur.netNative) < 1e-6, 'offsetting EUR/USD nets EUR');
}

// USD exposure across multiple pairs
{
  const positions = [
    pos({ id: 'p1', pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 }),
    pos({ id: 'p2', pair: 'USD/CAD', side: 'LONG', units: 200, entry: 1.38, current: 1.38 }),
  ];
  const exposures = buildFactorExposures({
    positions,
    quotes: INITIAL_QUOTES,
    accountCurrency: 'USD',
  });
  const usd = exposures.find((e) => e.factor === 'USD');
  assert(usd != null && usd.netNative !== 0, 'USD net across pairs non-zero');
}

// Perfectly correlated factors → higher variance than single factor
{
  const factors = ['EUR', 'USD'];
  const n = 60;
  const candles: Record<string, Candle[]> = {
    'EUR/USD': syntheticCandles('EUR/USD', 1.1, n, 0.0002),
  };
  const series = buildFactorReturnSeries({
    factors,
    pairs: ['EUR/USD'],
    candlesByPair: candles,
    nowSec: candles['EUR/USD'][n - 1].time,
  });
  assert(series != null, 'factor return series built');
  const cov = buildFactorCovarianceMatrix({ factorSeries: series! });
  assert(cov != null, 'factor covariance built');
  const e1 = [100, -110];
  const v1 = calculateFactorPortfolioVariance({
    exposures: e1,
    covariance: cov!,
    equity: 1000,
  });
  const v2 = calculateFactorPortfolioVariance({
    exposures: [100, 0],
    covariance: cov!,
    equity: 1000,
  });
  assert(
    v1.portfolioVol != null && v2.portfolioVol != null && v1.portfolioVol > v2.portfolioVol,
    'hedged legs can still have vol',
  );
}

// Risk contributions sum ≈ 100%
{
  const factors = ['EUR', 'USD', 'CAD'];
  const pairs = ['EUR/USD', 'USD/CAD'];
  const candles = candleMapForPairs(pairs, 80);
  const series = buildFactorReturnSeries({
    factors,
    pairs,
    candlesByPair: candles,
    nowSec: candles['EUR/USD'][79].time,
  });
  const cov = series ? buildFactorCovarianceMatrix({ factorSeries: series }) : null;
  if (cov) {
    const exposures = [50, -55, 20];
    const pv = calculateFactorPortfolioVariance({
      exposures,
      covariance: cov,
      equity: 500,
    });
    if (pv.variance != null && pv.variance > 0) {
      const contrib = calculateFactorRiskContributions({
        exposures,
        covariance: cov,
        portfolioVariance: pv.variance,
      });
      const sum = sumRiskContributions(contrib);
      assert(approx(sum, 100, 1), `risk contributions sum ~100% (got ${sum})`);
    }
  }
}

// Zero exposure book
{
  const snap = calculateRiskSnapshot({
    positions: [],
    quotes: INITIAL_QUOTES,
    candlesByPair: {},
    equity: 100,
    accountCurrency: 'USD',
  });
  assert(snap.factorExposures.length >= 0, 'empty book snapshot');
  assert(snap.portfolioVol == null || snap.portfolioVol === 0, 'empty book no vol');
}

// Insufficient observations
{
  const snap = calculateRiskSnapshot({
    positions: [pos({ pair: 'EUR/USD', side: 'LONG', units: 10, entry: 1.1, current: 1.1 })],
    quotes: INITIAL_QUOTES,
    candlesByPair: { 'EUR/USD': syntheticCandles('EUR/USD', 1.1, 5) },
    equity: 100,
    accountCurrency: 'USD',
  });
  assert(!snap.dataComplete, 'insufficient candle history flagged');
  assert(
    snap.warnings.some((w) => w.code === 'INSUFFICIENT_DATA'),
    'insufficient data warning',
  );
}

// VaR scaling with equity
{
  const v1 = calculateParametricVaR({ portfolioVol: 1, equity: 100, confidence: 0.95 });
  const v2 = calculateParametricVaR({ portfolioVol: 2, equity: 100, confidence: 0.95 });
  assert(
    v1.valueAtRisk != null &&
      v2.valueAtRisk != null &&
      approx(v2.valueAtRisk / v1.valueAtRisk, 2, 0.01),
    'VaR scales with portfolio vol',
  );
}

// Full snapshot with adequate history
{
  const pairs = ['EUR/USD', 'USD/CAD'];
  const positions = [
    pos({ id: 'p1', pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 }),
    pos({ id: 'p2', pair: 'USD/CAD', side: 'LONG', units: 150, entry: 1.38, current: 1.38 }),
  ];
  const candles = candleMapForPairs(pairs, 90);
  const snap = calculateRiskSnapshot({
    positions,
    quotes: INITIAL_QUOTES,
    candlesByPair: candles,
    equity: 500,
    accountCurrency: 'USD',
    riskBudgetVaR: 1,
  });
  assert(snap.dataComplete, 'adequate history → complete snapshot');
  assert(snap.portfolioVol != null && snap.portfolioVol > 0, 'positive portfolio vol');
  assert(snap.var95?.valueAtRisk != null, 'VaR95 computed');
  assert(snap.largestRiskFactor != null, 'largest factor identified');
  assert(snap.positionRisk.length === 2, 'position risk rows');
}

// Proposed position added (simulate via two snapshots)
{
  const pairs = ['EUR/USD'];
  const candles = candleMapForPairs(pairs, 80);
  const base = calculateRiskSnapshot({
    positions: [pos({ id: 'p1', pair: 'EUR/USD', side: 'LONG', units: 50, entry: 1.1, current: 1.1 })],
    quotes: INITIAL_QUOTES,
    candlesByPair: candles,
    equity: 500,
    accountCurrency: 'USD',
  });
  const added = calculateRiskSnapshot({
    positions: [pos({ id: 'p1', pair: 'EUR/USD', side: 'LONG', units: 150, entry: 1.1, current: 1.1 })],
    quotes: INITIAL_QUOTES,
    candlesByPair: candles,
    equity: 500,
    accountCurrency: 'USD',
  });
  if (base.portfolioVol != null && added.portfolioVol != null) {
    assert(added.portfolioVol >= base.portfolioVol, 'larger position ≥ portfolio vol');
  }
}

// Account currency conversion — USD account on EUR/USD
{
  const [base] = splitPair('EUR/USD');
  assert(base === 'EUR', 'pair split sanity');
  const exposures = buildFactorExposures({
    positions: [pos({ pair: 'EUR/USD', side: 'LONG', units: 100, entry: 1.1, current: 1.1 })],
    quotes: INITIAL_QUOTES,
    accountCurrency: 'USD',
  });
  const eur = exposures.find((e) => e.factor === 'EUR');
  assert(eur?.accountExposure != null && eur.accountExposure > 0, 'EUR account exposure in USD');
}

console.log(`factor self-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
