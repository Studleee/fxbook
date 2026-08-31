/**
 * USD/CAD example from FX Book pip spec.
 * Run: npx tsx src/fx/pips.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { INITIAL_QUOTES } from '../mock/seed';
import { DESK_PAIRS } from '../services/oanda/format';
import {
  buildUsdConversionRates,
  calculateEstimatedPnlUSD,
  calculatePipValueUSD,
  calculatePips,
  calculateStopRisk,
  conversionRatesForBook,
  getPipSize,
} from './pips';

const pair = 'USD/CAD';
const entry = 1.3832;
const current = 1.38498;
const units = 200;

assert.equal(getPipSize(pair), 0.0001);

const pips = calculatePips({ pair, side: 'LONG', entryPrice: entry, currentPrice: current });
assert.ok(Math.abs(pips - 17.8) < 0.05, `expected ~17.8 pips, got ${pips}`);

const pipValueUSD = calculatePipValueUSD({ pair, units, currentPrice: current });
assert.ok(
  Math.abs(pipValueUSD - 0.01444) < 0.0001,
  `expected ~$0.01444/pip, got ${pipValueUSD}`,
);

const estimatedPnlUSD = calculateEstimatedPnlUSD({ pips, pipValueUSD });
assert.ok(
  Math.abs(estimatedPnlUSD - 0.26) < 0.02,
  `expected ~$0.26 P&L, got ${estimatedPnlUSD}`,
);

const stopRiskUSD = calculateStopRisk({ pipValueUSD, stopLossPips: 30 });
assert.ok(Math.abs(stopRiskUSD - 0.43) < 0.02, `expected ~$0.43 stop risk, got ${stopRiskUSD}`);

const deskRates = buildUsdConversionRates(INITIAL_QUOTES);
for (const pair of DESK_PAIRS) {
  const quote = INITIAL_QUOTES[pair];
  assert.ok(quote, `missing mock quote for ${pair}`);
  const mid = (quote.bid + quote.ask) / 2;
  const pipValue = calculatePipValueUSD({
    pair,
    units: 100,
    currentPrice: mid,
    conversionRates: deskRates,
  });
  assert.ok(
    Number.isFinite(pipValue) && pipValue > 0,
    `${pair} $/pip not calculated (got ${pipValue})`,
  );
}

const withChf = conversionRatesForBook(INITIAL_QUOTES, [
  { pair: 'USD/CHF', current: 0.8765 },
]);
const usdChfPip = calculatePipValueUSD({
  pair: 'USD/CHF',
  units: 100,
  currentPrice: 0.8765,
  conversionRates: withChf,
});
assert.ok(Number.isFinite(usdChfPip) && usdChfPip > 0, `USD/CHF $/pip failed: ${usdChfPip}`);

console.log('fx/pips.selfcheck: ok');
