import type { RiskPolicy } from '../models';

export const INITIAL_RISK: RiskPolicy = {
  aggressionPct: 72,
  baseAddUnits: 50,
  basePositionUnits: 100,
  account: {
    maxDailyLossPct: 2.0,
    maxDrawdownPct: 4.0,
    maxOpenMarginPct: 85,
    maxSimultaneous: 8,
  },
  trade: {
    hardStopPips: 30,
    maxLossPerTrade: 1.5,
    trailActivatePips: 30,
    trailDistancePips: 12,
    maxDurationMin: 480,
    breakEvenPips: 20,
  },
  pair: {
    maxExposureUnits: 300,
    stopOutR: 1.0,
    cooldownAfterStopMin: 90,
    maxConsecutiveLosses: 3,
    lockDurationMin: 360,
  },
  currency: {
    maxNetPct: 45,
  },
};
