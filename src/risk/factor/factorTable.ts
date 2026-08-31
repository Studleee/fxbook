import type { CurrencyCapacityRow } from '../portfolio/bookMetrics';
import type { FactorExposure, RiskSnapshot } from './types';

export interface FactorRiskTableRow {
  currency: string;
  netNative: number;
  grossBookShare: number;
  currentVol: number | null;
  forecastVol: number | null;
  volChangePct: number | null;
  riskContributionPct: number | null;
  riskUtilizationPct: number | null;
  remainingCapacityPct: number | null;
  adverseShockPnL: number | null;
  adverseShockEquityPct: number | null;
  attributions: CurrencyCapacityRow['attributions'];
}

export function buildFactorRiskTableRows(args: {
  currencies: CurrencyCapacityRow[];
  snapshot: RiskSnapshot | null;
}): FactorRiskTableRow[] {
  const exposureByFactor = new Map(
    args.snapshot?.factorExposures.map((e) => [e.factor, e]) ?? [],
  );
  const riskByFactor = new Map(
    args.snapshot?.factorRisk.map((r) => [r.factor, r]) ?? [],
  );

  const rows = args.currencies.map((c) => {
    const risk = riskByFactor.get(c.currency);
    const exposure = exposureByFactor.get(c.currency);
    return {
      currency: c.currency,
      netNative: c.netNative,
      grossBookShare: exposure?.portfolioWeightPct ?? c.grossBookShare,
      currentVol: risk?.currentVol ?? null,
      forecastVol: risk?.forecastVol ?? null,
      volChangePct: risk?.volChangePct ?? null,
      riskContributionPct: risk?.riskContributionPct ?? null,
      riskUtilizationPct: c.riskUtilizationPct,
      remainingCapacityPct: c.remainingCapacityPct,
      adverseShockPnL: c.adverseShockPnL,
      adverseShockEquityPct: c.adverseShockEquityPct,
      attributions: c.attributions,
    };
  });

  return rows.sort((a, b) => {
    const ar = Math.abs(a.riskContributionPct ?? 0);
    const br = Math.abs(b.riskContributionPct ?? 0);
    if (br !== ar) return br - ar;
    return (b.grossBookShare ?? 0) - (a.grossBookShare ?? 0);
  });
}

export function affectedPositionsForFactor(
  factor: string,
  currencies: CurrencyCapacityRow[],
): string[] {
  const row = currencies.find((c) => c.currency === factor);
  if (!row) return [];
  const pairs = new Set<string>();
  for (const a of row.attributions) {
    if (Math.abs(a.signedNative) > 0) pairs.add(a.pair);
  }
  return [...pairs].sort();
}

export function factorExposureNative(
  factor: string,
  exposures: FactorExposure[],
): number {
  return exposures.find((e) => e.factor === factor)?.netNative ?? 0;
}
