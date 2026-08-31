import type { Candle, Position, Quote, RiskPolicy, Side } from '../../models';

export const DEFAULT_SHOCK_PERCENT = 0.001; // 0.10%

export interface PositionRiskProfile {
  positionId: string;
  pair: string;
  baseCurrency: string;
  quoteCurrency: string;
  direction: Side;
  units: number;
  signedUnits: number;
  currentPrice: number;
  entryPrice: number;
  hardStop: number | null;
  stopLossPips: number | null;
  unrealizedPnL: number;
  marginUsed: number;
  /** Account-currency P&L for a +shockPercent move in the pair price. */
  pairMoveSensitivity: number | null;
  dollarPnLPer0_10PercentMove: number | null;
  oneHourVolatility: number | null;
  standaloneOneHourRisk: number | null;
  conversionComplete: boolean;
}

export interface PairVolatilityMeta {
  pair: string;
  lookbackHours: number;
  sampleCount: number;
  volatility: number | null;
  lastUpdated: number;
}

export interface CovarianceMatrix {
  pairs: string[];
  volatilities: Record<string, number | null>;
  correlations: Record<string, Record<string, number | null>>;
  covariances: Record<string, Record<string, number | null>>;
  observationCount: number;
}

export interface PortfolioRiskSummary {
  grossStandaloneRisk: number | null;
  correlatedPortfolioRisk: number | null;
  diversificationBenefit: number | null;
  diversificationBenefitPercent: number | null;
  portfolioRiskPctOfEquity: number | null;
}

export interface PositionRiskContribution {
  positionId: string;
  pair: string;
  side: Side;
  units: number;
  oneHourVolatility: number | null;
  standaloneRisk: number | null;
  /** Component risk — may be negative when hedging. */
  portfolioContribution: number | null;
  portfolioContributionPct: number | null;
  stopRisk: number | null;
  stopRiskPctEquity: number | null;
  hasStop: boolean;
}

export interface CurrencyShockImpact {
  pair: string;
  direction: Side;
  units: number;
  oldPrice: number;
  shockedPrice: number;
  pnlImpact: number | null;
  priceChangePips: number | null;
}

export interface CurrencyShockResult {
  currency: string;
  shockPercent: number;
  positionImpacts: CurrencyShockImpact[];
  totalPnLImpact: number | null;
  upShockPnL: number | null;
  downShockPnL: number | null;
  worstCasePnL: number | null;
  worstCasePercentEquity: number | null;
  worstDirection: 'UP' | 'DOWN' | null;
  worstCaseImpacts: CurrencyShockImpact[];
  affectedPositionCount: number;
  riskContributionPct: number | null;
}

export interface BookSummary {
  openCount: number;
  grossExposure: number | null;
  netExposure: number | null;
  equity: number;
  grossLeverage: number | null;
}

export interface WorstShockHeadline {
  currency: string;
  shockPercent: string;
  scenarioLabel: string;
  bookImpact: number;
  equityImpact: number | null;
}

export interface RiskWorkbenchResult {
  accountCurrency: string;
  equity: number;
  shockPercent: number;
  maxCurrencyShockRiskPct: number;
  bookSummary: BookSummary;
  currencies: import('./bookMetrics').CurrencyCapacityRow[];
  shocks: import('./bookMetrics').EnrichedCurrencyShock[];
  shockScenarios: Record<string, import('./bookMetrics').EnrichedCurrencyShock[]>;
  activeShockPercent: number;
  worstShock: WorstShockHeadline | null;
  worstShockEquityPct: number | null;
  dataQuality: RiskDataQuality;
  /** Factor-based portfolio risk snapshot (BARRA-style). Null when candles unavailable. */
  snapshot: import('../factor/types').RiskSnapshot | null;
}

export interface StopRiskRow {
  positionId: string;
  pair: string;
  currentPrice: number;
  stop: number | null;
  units: number;
  stopLossPnL: number | null;
  stopLossPctEquity: number | null;
  hasStop: boolean;
}

export interface StopRiskSummary {
  rows: StopRiskRow[];
  totalStopRisk: number | null;
  stopRiskPctEquity: number | null;
}

export interface RiskCluster {
  id: string;
  label: string;
  pairs: string[];
  positionIds: string[];
  riskContributionPct: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface RiskDataQuality {
  pairsTotal: number;
  pairsWithVol: number;
  correlationObservations: number;
  partialModel: boolean;
  lastUpdated: number;
  notes: string[];
}

export interface BookRiskGovernorInput {
  equity: number;
  drawdownPct: number;
  marginUsedPct: number;
  dayPnl: number;
}

export interface BookRiskGovernorLimit {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit: '%' | 'USD';
  breached: boolean;
}

export interface BookRiskGovernor {
  status: 'SAFE' | 'CAUTION' | 'LIMIT APPROACHING' | 'LOCKED';
  triggeredLimits: BookRiskGovernorLimit[];
  effectiveLimits: Record<string, number>;
}

export interface BookRiskResult {
  accountCurrency: string;
  equity: number;
  positions: PositionRiskProfile[];
  volatilities: PairVolatilityMeta[];
  covariance: CovarianceMatrix | null;
  portfolio: PortfolioRiskSummary;
  contributions: PositionRiskContribution[];
  currencyShocks: CurrencyShockResult[];
  shockTests: Record<string, CurrencyShockResult[]>;
  stopRisk: StopRiskSummary;
  clusters: RiskCluster[];
  governor: BookRiskGovernor;
  dataQuality: RiskDataQuality;
  worstShock010: number | null;
  worstShock050: number | null;
  largestPairContributionPct: number | null;
  largestCurrencyContributionPct: number | null;
}

export interface CalculateBookRiskArgs {
  positions: Position[];
  quotes: Record<string, Quote>;
  candlesByPair: Record<string, Candle[]>;
  equity: number;
  accountCurrency: string;
  policy: RiskPolicy;
  governorInput: BookRiskGovernorInput;
  shockPercent?: number;
  nowMs?: number;
}
