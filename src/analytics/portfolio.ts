import type { AccountState, Position } from '../models';
import type { CorrelatedCluster, PortfolioConcentrationSnapshot } from './types';
import { calculateCurrencyExposure } from './exposure';

export function calculatePortfolioConcentration(args: {
  positions: Position[];
  account: AccountState;
  marginUsedPct: number;
  availableMarginPct: number;
  marginUsed?: number;
  largestCluster: CorrelatedCluster | null;
}): PortfolioConcentrationSnapshot {
  const longPositions = args.positions.filter((p) => p.side === 'LONG');
  const shortPositions = args.positions.filter((p) => p.side === 'SHORT');
  const longUnits = longPositions.reduce((s, p) => s + p.units, 0);
  const shortUnits = shortPositions.reduce((s, p) => s + p.units, 0);
  const grossExposureUnits = longUnits + shortUnits;
  const netExposureUnits = longUnits - shortUnits;

  let largestPairExposure: PortfolioConcentrationSnapshot['largestPairExposure'] = null;
  if (args.positions.length) {
    const top = [...args.positions].sort((a, b) => b.units - a.units)[0];
    largestPairExposure = {
      pair: top.pair,
      units: top.units,
      pct: grossExposureUnits > 0 ? (top.units / grossExposureUnits) * 100 : 0,
    };
  }

  const ccy = calculateCurrencyExposure(args.positions);
  const largestCurrency = ccy[0]
    ? { currency: ccy[0].currency, grossPct: ccy[0].grossPct }
    : null;

  return {
    grossExposureUnits,
    netExposureUnits,
    marginUsed: args.account.marginUsed ?? args.marginUsed ?? 0,
    marginUsedPct: args.marginUsedPct,
    availableMarginPct: args.availableMarginPct,
    largestPairExposure,
    largestCurrencyExposure: largestCurrency,
    largestCluster: args.largestCluster,
    openCount: args.positions.length,
    longCount: longPositions.length,
    shortCount: shortPositions.length,
    longUnits,
    shortUnits,
  };
}
