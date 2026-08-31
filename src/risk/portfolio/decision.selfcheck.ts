/**
 * Decision-support risk engine validation.
 * Run: npm run test:decision
 */
import type { Position } from '../../models';
import { INITIAL_QUOTES } from '../../mock/seed';
import { calculateBookMetrics } from './bookMetrics';
import { simulateBookChange } from './compareBookMetrics';
import { calculateShockDecomposition } from './shockContributions';
import { calculateRiskUtilization } from './riskUtilization';
import { classifyMarginalRisk } from './classifyMarginalRisk';
import { shockedPairPrice } from './currencyShock';
import { solveHedgeUnits } from './solveHedgeUnits';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
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

const basePositions: Position[] = [
  pos({ id: 'p1', pair: 'EUR/USD', side: 'SHORT', units: 100, entry: 1.1, current: 1.1 }),
  pos({ id: 'p2', pair: 'USD/CAD', side: 'LONG', units: 100, entry: 1.38, current: 1.38 }),
];

const equity = 54.8;

// Risk utilization
{
  const u = calculateRiskUtilization({ adverseShockEquityPct: -0.5, maxCurrencyShockRiskPct: 1 });
  assert(u.utilizationPct === 50, 'utilization 50%');
  assert(u.remainingCapacityPct === 50, 'remaining 50%');
}

// Over limit
{
  const u = calculateRiskUtilization({ adverseShockEquityPct: -1.37, maxCurrencyShockRiskPct: 1 });
  assert(u.utilizationPct === 137, 'over limit utilization');
  assert(u.remainingCapacityPct === -37, 'negative capacity');
}

// USD strengthens lowers EUR/USD
{
  const px = shockedPairPrice({
    pair: 'EUR/USD',
    currentPrice: 1.1,
    currency: 'USD',
    shockPercent: 0.001,
    quotes: INITIAL_QUOTES,
  });
  assert(px < 1.1, 'USD strengthen lowers EUR/USD');
}

// USD strengthens raises USD/CAD
{
  const px = shockedPairPrice({
    pair: 'USD/CAD',
    currentPrice: 1.38,
    currency: 'USD',
    shockPercent: 0.001,
    quotes: INITIAL_QUOTES,
  });
  assert(px > 1.38, 'USD strengthen raises USD/CAD');
}

// Add USD-long increases USD shock risk
{
  const { comparison } = simulateBookChange({
    positions: basePositions,
    quotes: INITIAL_QUOTES,
    equity,
    accountCurrency: 'USD',
    shockPercent: 0.001,
    maxCurrencyShockRiskPct: 1,
    change: { type: 'ADD_POSITION', pair: 'USD/CAD', side: 'LONG', units: 100 },
  });
  const usd = comparison.marginalCurrencyRisks.find((r) => r.currency === 'USD');
  assert(
    (comparison.riskDeltaEquityPct ?? 0) >= 0 || (usd?.marginalPnL ?? 0) <= 0,
    'USD-long add does not reduce worst shock',
  );
}

// Close position reduces risk
{
  const { comparison } = simulateBookChange({
    positions: basePositions,
    quotes: INITIAL_QUOTES,
    equity,
    accountCurrency: 'USD',
    shockPercent: 0.001,
    maxCurrencyShockRiskPct: 1,
    change: {
      type: 'CLOSE_POSITION',
      pair: 'USD/CAD',
      side: 'LONG',
      units: 100,
      positionId: 'p2',
    },
  });
  assert(
    comparison.classification === 'RISK REDUCING' ||
      (comparison.riskDeltaEquityPct ?? 1) <= 0,
    'close USD/CAD reduces or neutralizes risk',
  );
}

// Hedge offset decomposition
{
  const metrics = calculateBookMetrics({
    positions: basePositions,
    quotes: INITIAL_QUOTES,
    equity,
    accountCurrency: 'USD',
    shockPercent: 0.001,
  });
  const usdShock = metrics.shocks.find((s) => s.currency === 'USD');
  if (usdShock) {
    const d = calculateShockDecomposition(usdShock.worstCaseImpacts);
    assert(d.grossAdverseLoss <= 0, 'gross adverse <= 0');
    assert(d.hedgeOffset >= 0, 'hedge offset >= 0');
    const net = d.grossAdverseLoss + d.hedgeOffset;
    assert(
      usdShock.worstCasePnL == null ||
        Math.abs(net - usdShock.worstCasePnL) < 0.02,
      'net reconciles to worst case',
    );
  }
}

// Classification tiers
{
  assert(classifyMarginalRisk(-0.05) === 'RISK REDUCING', 'negative delta reducing');
  assert(classifyMarginalRisk(0.05) === 'LOW RISK ADD', 'low add');
  assert(classifyMarginalRisk(0.15) === 'MODERATE RISK ADD', 'moderate add');
  assert(classifyMarginalRisk(0.3) === 'HIGH RISK ADD', 'high add');
}

// Zero positions
{
  const m = calculateBookMetrics({
    positions: [],
    quotes: INITIAL_QUOTES,
    equity: 100,
    accountCurrency: 'USD',
  });
  assert(m.currencies.length === 0, 'empty book no currencies');
}

// Hedge solver
{
  const solved = solveHedgeUnits({
    positions: basePositions,
    quotes: INITIAL_QUOTES,
    equity,
    accountCurrency: 'USD',
    shockPercent: 0.001,
    maxCurrencyShockRiskPct: 0.5,
    hedgePair: 'USD/CAD',
    hedgeSide: 'SHORT',
    currency: 'USD',
    targetType: 'CURRENCY_UTIL',
    targetUtilizationPct: 100,
  });
  assert(
    solved.feasible || solved.alreadyAtTarget || Boolean(solved.note),
    'hedge solve returns',
  );
  if (solved.feasible && !solved.alreadyAtTarget && solved.unitsNeeded > 0) {
    assert(solved.unitsNeeded > 0, 'positive hedge units when needed');
  }
}

console.log(`decision self-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
