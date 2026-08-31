import { finiteOrNull } from '../../analytics/math';

export interface RiskUtilizationResult {
  utilizationPct: number | null;
  remainingCapacityPct: number | null;
}

/**
 * riskUtilization = |adverseShockEquityPct| / maxCurrencyShockRiskPct × 100
 * remainingCapacity = 100 − utilization (may be negative when over limit)
 */
export function calculateRiskUtilization(args: {
  adverseShockEquityPct: number | null;
  maxCurrencyShockRiskPct: number;
}): RiskUtilizationResult {
  const adverse = args.adverseShockEquityPct;
  const max = args.maxCurrencyShockRiskPct;
  if (adverse == null || !Number.isFinite(adverse) || max <= 0) {
    return { utilizationPct: null, remainingCapacityPct: null };
  }
  const utilizationPct = finiteOrNull((Math.abs(adverse) / max) * 100);
  const remainingCapacityPct =
    utilizationPct != null ? finiteOrNull(100 - utilizationPct) : null;
  return { utilizationPct, remainingCapacityPct };
}
