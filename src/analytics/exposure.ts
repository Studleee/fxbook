import type { Position } from '../models';
import type { CurrencyExposureRow } from './types';
import { sum } from './math';

export interface CurrencyLeg {
  currency: string;
  units: number;
}

/** Decompose each open position into signed base/quote currency legs. */
export function decomposePositionLegs(position: Position): CurrencyLeg[] {
  const [base, quote] = position.pair.split('/');
  const sign = position.side === 'LONG' ? 1 : -1;
  return [
    { currency: base, units: sign * position.units },
    { currency: quote, units: -sign * position.units },
  ];
}

export function calculateCurrencyExposure(positions: Position[]): CurrencyExposureRow[] {
  const map = new Map<string, { long: number; short: number }>();

  for (const pos of positions) {
    for (const leg of decomposePositionLegs(pos)) {
      const row = map.get(leg.currency) ?? { long: 0, short: 0 };
      if (leg.units >= 0) row.long += leg.units;
      else row.short += Math.abs(leg.units);
      map.set(leg.currency, row);
    }
  }

  const grossTotal =
    sum([...map.values()].map((r) => r.long + r.short)) || 1;

  const rows: CurrencyExposureRow[] = [...map.entries()].map(([currency, r]) => {
    const netUnits = r.long - r.short;
    const grossUnits = r.long + r.short;
    const grossPct = (grossUnits / grossTotal) * 100;
    const netPct = (Math.abs(netUnits) / grossTotal) * 100;
    return {
      currency,
      netUnits,
      longUnits: r.long,
      shortUnits: r.short,
      grossPct,
      netPct,
      concentrated: grossPct >= 35 || netPct >= 25,
    };
  });

  return rows.sort((a, b) => b.grossPct - a.grossPct);
}
