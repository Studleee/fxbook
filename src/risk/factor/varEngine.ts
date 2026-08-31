import { VAR_Z_95, VAR_Z_99 } from './constants';
import type { VaRResult } from './types';

const Z_BY_CONFIDENCE: Record<number, number> = {
  0.95: VAR_Z_95,
  0.99: VAR_Z_99,
};

/**
 * Parametric VaR from portfolio volatility (account currency).
 * portfolioSigma = σ_P / equity (decimal, not %)
 */
export function calculateParametricVaR(args: {
  portfolioVol: number | null;
  equity: number;
  confidence: number;
  horizonDays?: number;
}): VaRResult {
  const horizonDays = args.horizonDays ?? 1;
  if (
    args.portfolioVol == null ||
    !Number.isFinite(args.portfolioVol) ||
    args.equity <= 0
  ) {
    return {
      horizonDays,
      confidence: args.confidence,
      portfolioVolPct: null,
      valueAtRisk: null,
      equityPct: null,
    };
  }

  const z = Z_BY_CONFIDENCE[args.confidence] ?? VAR_Z_95;
  const portfolioVolPct = (args.portfolioVol / args.equity) * 100;
  const valueAtRisk = z * args.portfolioVol;
  const equityPct = (valueAtRisk / args.equity) * 100;

  return {
    horizonDays,
    confidence: args.confidence,
    portfolioVolPct,
    valueAtRisk,
    equityPct,
  };
}

export function calculateRiskUtilizationFromVaR(args: {
  currentVaR: number | null;
  riskBudgetVaR: number | null;
}): { utilization: number | null; capacity: number | null } {
  if (
    args.currentVaR == null ||
    args.riskBudgetVaR == null ||
    !Number.isFinite(args.currentVaR) ||
    !Number.isFinite(args.riskBudgetVaR) ||
    args.riskBudgetVaR <= 0
  ) {
    return { utilization: null, capacity: null };
  }
  const utilization = (Math.abs(args.currentVaR) / args.riskBudgetVaR) * 100;
  return {
    utilization,
    capacity: 100 - utilization,
  };
}
