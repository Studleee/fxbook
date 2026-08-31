/**
 * Portfolio risk self-check.
 * Run: npm run test:risk
 */
import type { Position } from '../../models';
import { calculatePairShockPnL, pairShockPnLQuote } from './positionSensitivity';
import { shockedPairPrice } from './currencyShock';
import { calculatePortfolioVariance } from './portfolioRisk';
import { calculateRiskWorkbench } from './riskWorkbench';
import { INITIAL_QUOTES } from '../../mock/seed';
import type { CovarianceMatrix } from './types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

const pos = (partial: Partial<Position> & Pick<Position, 'pair' | 'side' | 'units' | 'entry' | 'current'>): Position => ({
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

// Long EUR/USD +0.1% price shock
{
  const p = pos({ pair: 'EUR/USD', side: 'LONG', units: 100, entry: 1.1, current: 1.1 });
  const q = pairShockPnLQuote({ side: 'LONG', units: 100, currentPrice: 1.1, shockPercent: 0.001 });
  assert(approx(q, 0.11), 'long EUR/USD quote shock');
  const { pnl } = calculatePairShockPnL({ position: p, shockPercent: 0.001, quotes: INITIAL_QUOTES, accountCurrency: 'USD' });
  assert(pnl != null && approx(pnl, 0.11), 'long EUR/USD USD shock');
}

// Short inverts
{
  const p = pos({ pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 });
  const { pnl } = calculatePairShockPnL({ position: p, shockPercent: 0.001, quotes: INITIAL_QUOTES, accountCurrency: 'USD' });
  assert(pnl != null && approx(pnl!, -0.11), 'short EUR/USD shock');
}

// USD strengthens → EUR/USD down
{
  const px = shockedPairPrice({ pair: 'EUR/USD', currentPrice: 1.1, currency: 'USD', shockPercent: 0.001, quotes: INITIAL_QUOTES });
  assert(px < 1.1, 'USD strengthen lowers EUR/USD');
}

// USD strengthens → USD/CAD up
{
  const px = shockedPairPrice({ pair: 'USD/CAD', currentPrice: 1.38, currency: 'USD', shockPercent: 0.001, quotes: INITIAL_QUOTES });
  assert(px > 1.38, 'USD strengthen raises USD/CAD');
}

// Identical correlated positions → higher portfolio risk than independent (synthetic)
{
  const vol = 0.01;
  const cov: CovarianceMatrix = {
    pairs: ['EUR/USD', 'GBP/USD'],
    volatilities: { 'EUR/USD': vol, 'GBP/USD': vol },
    correlations: { 'EUR/USD': { 'EUR/USD': 1, 'GBP/USD': 1 }, 'GBP/USD': { 'EUR/USD': 1, 'GBP/USD': 1 } },
    covariances: {
      'EUR/USD': { 'EUR/USD': vol * vol, 'GBP/USD': vol * vol },
      'GBP/USD': { 'EUR/USD': vol * vol, 'GBP/USD': vol * vol },
    },
    observationCount: 100,
  };
  const wSame = [1, 1];
  const wIndep = [1, 0];
  const varSame = calculatePortfolioVariance({ weights: wSame, covariance: cov, pairOrder: cov.pairs });
  const varOne = calculatePortfolioVariance({ weights: wIndep, covariance: cov, pairOrder: cov.pairs });
  assert(varSame != null && varOne != null && varSame > varOne, 'correlated book risk > single leg');
}

// Empty portfolio
{
  const book = calculateRiskWorkbench({
    positions: [],
    quotes: INITIAL_QUOTES,
    equity: 100,
    accountCurrency: 'USD',
  });
  assert(book.bookSummary.openCount === 0, 'empty book');
}

console.log(`risk self-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
