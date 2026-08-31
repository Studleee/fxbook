import type { CurrencyShockImpact, CurrencyShockResult } from './types';

export interface ShockDecomposition {
  grossAdverseLoss: number;
  hedgeOffset: number;
  netImpact: number;
}

export interface ShockContributionRow extends CurrencyShockImpact {
  pctOfGrossAdverse: number | null;
}

export function calculateShockDecomposition(
  impacts: CurrencyShockImpact[],
): ShockDecomposition {
  let grossAdverseLoss = 0;
  let hedgeOffset = 0;
  for (const imp of impacts) {
    const pnl = imp.pnlImpact;
    if (pnl == null || !Number.isFinite(pnl)) continue;
    if (pnl < 0) grossAdverseLoss += pnl;
    else if (pnl > 0) hedgeOffset += pnl;
  }
  return {
    grossAdverseLoss,
    hedgeOffset,
    netImpact: grossAdverseLoss + hedgeOffset,
  };
}

/** Contribution % = position P&L / gross adverse loss (hedges show negative %). */
export function calculateShockContributions(
  shock: CurrencyShockResult,
): ShockContributionRow[] {
  const { grossAdverseLoss } = calculateShockDecomposition(shock.worstCaseImpacts);
  const denom = grossAdverseLoss;
  return shock.worstCaseImpacts
    .map((imp) => ({
      ...imp,
      pctOfGrossAdverse:
        imp.pnlImpact != null && denom < 0
          ? (imp.pnlImpact / denom) * 100
          : null,
    }))
    .sort((a, b) => Math.abs(b.pnlImpact ?? 0) - Math.abs(a.pnlImpact ?? 0));
}
