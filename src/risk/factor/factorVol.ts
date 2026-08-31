import { stdDev } from '../../analytics/math';
import type { FactorReturnSeries } from './factorReturns';
import type { FactorRiskContribution } from './types';

/** Compare recent-half vs full-window vol per factor for vol-change column. */
export function enrichFactorVolChanges(
  factorRisk: FactorRiskContribution[],
  factorSeries: FactorReturnSeries | null,
): FactorRiskContribution[] {
  if (!factorSeries) return factorRisk;

  return factorRisk.map((row) => {
    const idx = factorSeries.factors.indexOf(row.factor);
    if (idx < 0) return row;

    const returns = factorSeries.returnsByFactor[idx].filter(Number.isFinite);
    if (returns.length < 10) return row;

    const fullVol = stdDev(returns);
    const half = returns.slice(Math.floor(returns.length / 2));
    const recentVol = stdDev(half);
    if (fullVol == null || recentVol == null || fullVol <= 0) {
      return { ...row, currentVol: fullVol, forecastVol: recentVol };
    }

    const volChangePct = ((recentVol - fullVol) / fullVol) * 100;
    return {
      ...row,
      currentVol: fullVol,
      forecastVol: recentVol,
      volChangePct,
    };
  });
}

export function formatFactorVol(vol: number | null): string {
  if (vol == null || !Number.isFinite(vol)) return 'N/A';
  return `${(vol * 100).toFixed(2)}%`;
}

export function formatVolChange(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return 'N/A';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}
