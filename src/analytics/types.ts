import type { Position, Side } from '../models';

export type CorrelationWindow = '24H' | '7D' | '30D' | '90D';

export type TradeExitReason =
  | 'STOP'
  | 'TRAIL'
  | 'TIME'
  | 'MANUAL'
  | 'BOOK_FLAT'
  | 'FORCE'
  | 'OTHER';

export type JournalSource = 'FX BOOK' | 'TRADING ENGINE' | 'OANDA' | 'RISK ENGINE' | 'USER' | 'SYSTEM' | 'BROKER' | 'ALGO';

export type JournalEventType =
  | 'SIGNAL'
  | 'OPEN'
  | 'ADD'
  | 'REDUCE'
  | 'STOP SET'
  | 'TAKE PROFIT SET'
  | 'TRAIL SET'
  | 'LOCKOUT'
  | 'UNLOCK'
  | 'CLOSE'
  | 'CLOSE BOOK'
  | 'SYSTEM DISABLE'
  | 'SYSTEM ENABLE'
  | 'OTHER';

export type PairPerformanceStatus = 'STRONG' | 'NORMAL' | 'WATCH' | 'WEAK';

export type TradingSession = 'ASIA' | 'LONDON' | 'NEW YORK';
export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH';
export type TrendRegime = 'TRENDING' | 'RANGING';

/** Completed trade — populated live on close; MFE/MAE null until tick history exists. */
export interface ClosedTrade {
  tradeId: string;
  pair: string;
  direction: Side;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  units: number;
  pips: number;
  realizedPnL: number;
  marginUsed: number;
  holdDurationMs: number;
  stopLossPips: number | null;
  takeProfitPips: number | null;
  trailingStartPips: number | null;
  trailingDistancePips: number | null;
  lockoutHours: number | null;
  exitReason: TradeExitReason;
  mfe: number | null;
  mae: number | null;
  mfePips: number | null;
  maePips: number | null;
  /** Initial risk in USD when stop was known — used for R-multiple / SQN. */
  initialRiskUsd: number | null;
  rMultiple: number | null;
}

export interface EquitySnapshot {
  timestamp: number;
  balance: number;
  equity: number;
  unrealizedPnL: number;
  marginUsed: number;
  availableMargin: number;
  openPositions: number;
  drawdownPct: number;
  /** live = desk sampling; oanda/csv = reconstructed balance history */
  source?: 'live' | 'oanda' | 'csv';
}

export interface JournalEntry {
  id: string;
  timestamp: number;
  pair: string;
  event: JournalEventType;
  direction: Side | null;
  units: number | null;
  price: number | null;
  pnl: number | null;
  pips: number | null;
  source: JournalSource;
  notes: string;
}

export interface CurrencyExposureRow {
  currency: string;
  netUnits: number;
  longUnits: number;
  shortUnits: number;
  grossPct: number;
  netPct: number;
  concentrated: boolean;
}

export interface CorrelationCell {
  pairA: string;
  pairB: string;
  correlation: number | null;
  observationCount: number;
  window: CorrelationWindow;
  returnTimeframe: string;
  sufficient: boolean;
  isDiagonal?: boolean;
}

export type CorrelationStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTREME' | 'N/A';
export type CorrelationDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'N/A';

export interface CorrelationSelection {
  pairA: string;
  pairB: string;
  correlation: number | null;
  observationCount: number;
  window: CorrelationWindow;
  returnTimeframe: string;
  strength: CorrelationStrength;
  direction: CorrelationDirection;
  bothOpen: boolean;
  relationship: 'REINFORCING' | 'OFFSETTING' | 'MIXED / NEUTRAL' | 'NOT BOTH OPEN';
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'N/A';
  positionA: Position | null;
  positionB: Position | null;
}

export interface CorrelatedCluster {
  id: string;
  label: string;
  pairs: string[];
  positionIds: string[];
  score: number;
  exposurePct: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PortfolioConcentrationSnapshot {
  grossExposureUnits: number;
  netExposureUnits: number;
  marginUsed: number;
  marginUsedPct: number;
  availableMarginPct: number;
  largestPairExposure: { pair: string; units: number; pct: number } | null;
  largestCurrencyExposure: { currency: string; grossPct: number } | null;
  largestCluster: CorrelatedCluster | null;
  openCount: number;
  longCount: number;
  shortCount: number;
  longUnits: number;
  shortUnits: number;
}

export interface TradeMetricsSummary {
  totalTrades: number;
  winRate: number | null;
  netPnL: number;
  profitFactor: number | null;
  expectancy: number | null;
  expectancyUsd: number | null;
  avgWinner: number | null;
  avgLoser: number | null;
  payoffRatio: number | null;
  avgPips: number | null;
  avgUsd: number | null;
  maxDrawdownPct: number | null;
  sharpe: number | null;
  sortino: number | null;
  sqn: number | null;
  avgHoldMs: number | null;
  hasData: boolean;
}

export interface PairPerformanceRow {
  pair: string;
  trades: number;
  pnl: number;
  pips: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  maxDrawdownPct: number | null;
  avgHoldMs: number | null;
  status: PairPerformanceStatus;
}

export interface RegimePerformanceRow {
  regime: string;
  trades: number;
  expectancy: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  winRate: number | null;
}

export interface MfeMaeSummary {
  available: boolean;
  reason: string;
  medianWinnerMfePips: number | null;
  medianLoserMaePips: number | null;
  p75WinnerMfePips: number | null;
  p90LoserMaePips: number | null;
}
