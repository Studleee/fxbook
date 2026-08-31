export type OandaEnv = 'PAPER' | 'LIVE';

export interface OandaAccountRef {
  id: string;
  tags?: string[];
}

export interface OandaAccountSummary {
  id: string;
  alias?: string;
  currency: string;
  balance: string;
  NAV: string;
  pl: string;
  unrealizedPL?: string;
  resettablePL?: string;
  marginUsed: string;
  marginAvailable: string;
  openPositionCount?: string | number;
  lastTransactionID?: string;
}

export interface OandaPrice {
  instrument: string;
  bids?: { price: string }[];
  asks?: { price: string }[];
  closeoutBid?: string;
  closeoutAsk?: string;
  status?: string;
}

export interface OandaCandle {
  time: string;
  complete?: boolean;
  mid?: { o: string; h: string; l: string; c: string };
  bid?: { o: string; h: string; l: string; c: string };
}

export interface OandaPositionSide {
  units: string;
  averagePrice?: string;
  unrealizedPL?: string;
  pl?: string;
  tradeIDs?: string[];
}

export interface OandaPosition {
  instrument: string;
  long: OandaPositionSide;
  short: OandaPositionSide;
  unrealizedPL?: string;
  marginUsed?: string;
}

export interface OandaTrade {
  id: string;
  instrument: string;
  price: string;
  currentUnits: string;
  unrealizedPL?: string;
  openTime?: string;
  stopLossOrder?: { price?: string };
  trailingStopLossOrder?: { trailingStopValue?: string; distance?: string };
}

export interface OandaErrorBody {
  errorMessage?: string;
  errorCode?: string;
}

export interface OandaTransaction {
  id: string;
  time?: string;
  type?: string;
  accountBalance?: string;
  pl?: string;
  instrument?: string;
  units?: string;
  price?: string;
}
