/** Central thresholds for marginal-risk classification (equity % points). */
export const MARGINAL_RISK_THRESHOLDS = {
  /** riskDelta <= 0 → RISK REDUCING */
  lowMax: 0.1,
  /** (0, lowMax] → LOW RISK ADD; (lowMax, moderateMax] → MODERATE */
  moderateMax: 0.25,
} as const;

/** Default user-defined max single-currency shock risk (% of equity). */
export const DEFAULT_MAX_CURRENCY_SHOCK_RISK_PCT = 1.0;

export const MAX_CURRENCY_SHOCK_RISK_STORAGE_KEY = 'fxbook.maxCurrencyShockRiskPct';

export type MarginalRiskClassification =
  | 'RISK REDUCING'
  | 'LOW RISK ADD'
  | 'MODERATE RISK ADD'
  | 'HIGH RISK ADD'
  | 'UNKNOWN';
