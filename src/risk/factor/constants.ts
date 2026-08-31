import type { CurrencyFactorId } from './types';

export const CURRENCY_FACTORS: CurrencyFactorId[] = [
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SGD',
];

export const FACTOR_COV_LOOKBACK_DAYS = 7;
export const FACTOR_COV_BUCKET_SEC = 3600;
export const FACTOR_COV_MIN_OBS = 20;
export const FACTOR_COV_EWMA_LAMBDA = 0.94;

export const VAR_Z_95 = 1.645;
export const VAR_Z_99 = 2.326;

/** Scale 1H return covariance to 1 trading day (24h). */
export const HOURS_PER_DAY = 24;
