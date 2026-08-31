export type Environment = 'LIVE' | 'PAPER' | 'SIM';
export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected';
export type AlgoStatus = 'RUNNING' | 'PAUSED' | 'LOCKED' | 'COOLDOWN' | 'ERROR' | 'DISABLED';
export type EntryMode = 'AUTO' | 'MANUAL' | 'OFF';
export type HybridMode = 'AUTO' | 'HYBRID' | 'MANUAL';
export type Signal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type Side = 'LONG' | 'SHORT';
export type HealthState = 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'CRITICAL';
export type PageId =
  | 'desk'
  | 'positions'
  | 'risk'
  | 'analytics'
  | 'journal'
  | 'settings';
export type BottomTab =
  | 'positions'
  | 'execution-log'
  | 'system-log';
export type EventSource = 'ALGO' | 'RISK ENGINE' | 'USER' | 'BROKER' | 'SYSTEM';
export type PositionStatus = 'ACTIVE' | 'TRAILING' | 'STOPPING' | 'CLOSING';
export type OrderType = 'STOP' | 'LIMIT' | 'MARKET';
export type OrderStatus = 'WORKING' | 'FILLED' | 'CANCELLED';

export interface Quote {
  bid: number;
  ask: number;
  spreadPips: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AccountState {
  currency: string;
  balance: number;
  realizedToday: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  peakEquity: number;
  marginUsedPct: number;
  /** OANDA NAV — when set, equity/margin % come from the broker summary. */
  nav?: number;
  marginUsed?: number;
  marginAvailable?: number;
}

export interface AlgoHealth {
  lastN: number;
  winRate: number;
  profitFactor: number;
  expectancyR: number;
  avgWinR: number;
  avgLossR: number;
  rollingDrawdownPct: number;
  state: HealthState;
}

export interface Algo {
  id: string;
  pair: string;
  strategy: string;
  status: AlgoStatus;
  signal: Signal;
  health: HealthState;
  exposureUnits: number;
  pnlToday: number;
  lockReason: string | null;
  cooldownEndsAt: number | null;
  lastError: string | null;
  consecutiveLosses: number;
  entryMode: EntryMode;
  managementMode: HybridMode;
  exitMode: HybridMode;
  riskArmed: boolean;
  entryQuietUntil: number;
  metrics: AlgoHealth;
}

export interface Position {
  id: string;
  pair: string;
  algoId: string;
  strategy: string;
  side: Side;
  units: number;
  entry: number;
  current: number;
  stop: number;
  trail: number | null;
  unrealizedPnl: number;
  margin: number;
  openedAt: number;
  status: PositionStatus;
}

export interface Order {
  id: string;
  pair: string;
  strategy: string;
  type: OrderType;
  side: Side;
  units: number;
  price: number;
  status: OrderStatus;
  createdAt: number;
}

export interface TerminalEvent {
  id: string;
  timestamp: number;
  strategy: string;
  pair: string;
  event: string;
  source: EventSource;
  reason: string;
}

export interface SystemState {
  environment: Environment;
  brokerName: string;
  broker: ConnectionStatus;
  data: ConnectionStatus;
  engine: ConnectionStatus;
  clock: string;
}

export type RiskStatus = 'SAFE' | 'CAUTION' | 'LIMIT APPROACHING' | 'LOCKED';

export interface RiskPolicy {
  aggressionPct: number;
  baseAddUnits: number;
  basePositionUnits: number;
  account: {
    maxDailyLossPct: number;
    maxDrawdownPct: number;
    maxOpenMarginPct: number;
    maxSimultaneous: number;
  };
  trade: {
    hardStopPips: number;
    maxLossPerTrade: number;
    trailActivatePips: number;
    trailDistancePips: number;
    maxDurationMin: number;
    breakEvenPips: number | null;
  };
  pair: {
    maxExposureUnits: number;
    stopOutR: number;
    cooldownAfterStopMin: number;
    maxConsecutiveLosses: number;
    lockDurationMin: number;
  };
  currency: {
    maxNetPct: number;
  };
}
