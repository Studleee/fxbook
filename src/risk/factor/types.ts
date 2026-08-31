import type { Side } from '../../models';

/** Supported currency factors (extensible to macro factors later). */
export type CurrencyFactorId =
  | 'USD'
  | 'EUR'
  | 'JPY'
  | 'GBP'
  | 'CHF'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'SGD';

export type RiskRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' | 'INSUFFICIENT_DATA';

export type MatrixHealth = 'OK' | 'INSUFFICIENT_DATA' | 'REGULARIZED';

export type RiskWarningSeverity = 'INFO' | 'WATCH' | 'HIGH' | 'CRITICAL';

export interface RiskWarning {
  severity: RiskWarningSeverity;
  code: string;
  message: string;
  factor?: string;
}

export interface FactorExposure {
  factor: string;
  netNative: number;
  accountExposure: number | null;
  portfolioWeightPct: number | null;
  conversionComplete: boolean;
}

export interface FactorRiskContribution {
  factor: string;
  marginalRisk: number | null;
  componentVariance: number | null;
  riskContributionPct: number | null;
  currentVol: number | null;
  forecastVol: number | null;
  volChangePct: number | null;
}

export interface PositionFactorRisk {
  positionId: string;
  pair: string;
  side: Side;
  units: number;
  unrealizedPnL: number;
  accountExposure: number | null;
  riskContributionPct: number | null;
  expectedMove: number | null;
  var95: number | null;
}

export interface CovarianceMetadata {
  lookbackDays: number;
  observations: number;
  lastUpdated: number;
  method: 'ROLLING' | 'EWMA';
  matrixHealth: MatrixHealth;
  factors: string[];
}

export interface FactorCovarianceMatrix {
  factors: string[];
  covariances: number[][];
  correlations: number[][];
  volatilities: number[];
  observationCount: number;
  lookbackDays: number;
  method: 'ROLLING' | 'EWMA';
  matrixHealth: MatrixHealth;
  lastUpdated: number;
}

export interface VaRResult {
  horizonDays: number;
  confidence: number;
  portfolioVolPct: number | null;
  valueAtRisk: number | null;
  equityPct: number | null;
}

export interface PortfolioVarianceResult {
  variance: number | null;
  portfolioVol: number | null;
  portfolioVolPct: number | null;
  specificRiskVariance: number;
}

export interface RiskSnapshot {
  timestamp: string;
  equity: number;
  balance: number;
  accountCurrency: string;

  portfolioVol: number | null;
  portfolioVolPct: number | null;
  realizedVol: number | null;
  realizedVolPct: number | null;
  forecastVol: number | null;
  forecastVolPct: number | null;
  forecastChangePct: number | null;

  var95: VaRResult | null;
  var99: VaRResult | null;

  expectedMove: number | null;
  expectedMovePct: number | null;
  stressLoss: number | null;

  riskUtilization: number | null;
  capacity: number | null;
  riskBudgetVaR: number | null;

  largestRiskFactor: string | null;
  regime: RiskRegime;

  factorExposures: FactorExposure[];
  factorRisk: FactorRiskContribution[];
  positionRisk: PositionFactorRisk[];

  covariance: FactorCovarianceMatrix | null;
  covarianceMetadata: CovarianceMetadata | null;

  warnings: RiskWarning[];
  dataComplete: boolean;
}

export interface CalculateRiskSnapshotArgs {
  positions: import('../../models').Position[];
  quotes: Record<string, import('../../models').Quote>;
  candlesByPair: Record<string, import('../../models').Candle[]>;
  equity: number;
  balance?: number;
  accountCurrency: string;
  riskBudgetVaR?: number | null;
  shockPercent?: number;
  maxCurrencyShockRiskPct?: number;
  nowMs?: number;
}
