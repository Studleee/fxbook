import {
  MARGINAL_RISK_THRESHOLDS,
  type MarginalRiskClassification,
} from './decisionConfig';

/**
 * riskDeltaEquity = |hypothetical worst shock %| − |current worst shock %|
 * Negative → risk reducing; positive → risk add tiers.
 */
export function classifyMarginalRisk(
  riskDeltaEquityPct: number | null,
): MarginalRiskClassification {
  if (riskDeltaEquityPct == null || !Number.isFinite(riskDeltaEquityPct)) {
    return 'UNKNOWN';
  }
  if (riskDeltaEquityPct <= 0) return 'RISK REDUCING';
  if (riskDeltaEquityPct <= MARGINAL_RISK_THRESHOLDS.lowMax) return 'LOW RISK ADD';
  if (riskDeltaEquityPct <= MARGINAL_RISK_THRESHOLDS.moderateMax) {
    return 'MODERATE RISK ADD';
  }
  return 'HIGH RISK ADD';
}

export function worstShockRiskDelta(args: {
  currentWorstEquityPct: number | null;
  hypotheticalWorstEquityPct: number | null;
}): number | null {
  const cur = args.currentWorstEquityPct;
  const hypo = args.hypotheticalWorstEquityPct;
  if (cur == null || hypo == null) return null;
  if (!Number.isFinite(cur) || !Number.isFinite(hypo)) return null;
  return Math.abs(hypo) - Math.abs(cur);
}
