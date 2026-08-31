import type { Position, Quote, RiskPolicy } from '../models';
import type { EventSource } from '../models';
import { calculatePips, calculatePositionFxMetrics, calculateStopRisk, conversionRatesForBook } from '../fx/pips';
import type { ClosedTrade, JournalEntry, JournalEventType, JournalSource, TradeExitReason } from './types';
import { effectiveLimits } from '../risk/engine';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function mapExitReason(label: string, reason: string): TradeExitReason {
  const text = `${label} ${reason}`.toUpperCase();
  if (text.includes('STOP') && !text.includes('TRAIL')) return 'STOP';
  if (text.includes('TRAIL')) return 'TRAIL';
  if (text.includes('TIME')) return 'TIME';
  if (text.includes('BOOK')) return 'BOOK_FLAT';
  if (text.includes('FORCE')) return 'FORCE';
  if (text.includes('MANUAL') || text.includes('REDUCE') || text.includes('CLOSE')) return 'MANUAL';
  return 'OTHER';
}

export function mapEventSource(source: EventSource): JournalSource {
  switch (source) {
    case 'USER':
      return 'FX BOOK';
    case 'ALGO':
      return 'TRADING ENGINE';
    case 'BROKER':
      return 'OANDA';
    case 'RISK ENGINE':
      return 'RISK ENGINE';
    default:
      return 'SYSTEM';
  }
}

export function buildClosedTrade(args: {
  position: Position;
  exitPrice: number;
  exitTime: number;
  exitLabel: string;
  exitReason: string;
  risk: RiskPolicy;
  quotes?: Record<string, Quote>;
}): ClosedTrade {
  const { position: pos } = args;
  const limits = effectiveLimits(args.risk);
  const pips = calculatePips({
    pair: pos.pair,
    side: pos.side,
    entryPrice: pos.entry,
    currentPrice: args.exitPrice,
  });

  const rates = args.quotes ? conversionRatesForBook(args.quotes, [pos]) : undefined;
  let initialRiskUsd: number | null = null;
  if (pos.stop > 0) {
    const fx = calculatePositionFxMetrics({
      pair: pos.pair,
      side: pos.side,
      units: pos.units,
      entryPrice: pos.entry,
      currentPrice: args.exitPrice,
      stopPrice: pos.stop,
      conversionRates: rates,
    });
    if (fx.stopLossPips != null && Number.isFinite(fx.pipValueUSD)) {
      initialRiskUsd = calculateStopRisk({
        pipValueUSD: fx.pipValueUSD,
        stopLossPips: fx.stopLossPips,
      });
    }
  }

  return {
    tradeId: uid('tr'),
    pair: pos.pair,
    direction: pos.side,
    entryTime: pos.openedAt,
    entryPrice: pos.entry,
    exitTime: args.exitTime,
    exitPrice: args.exitPrice,
    units: pos.units,
    pips,
    realizedPnL: 0,
    marginUsed: pos.margin,
    holdDurationMs: Math.max(0, args.exitTime - pos.openedAt),
    stopLossPips: limits.hardStopPips,
    takeProfitPips: null,
    trailingStartPips: limits.trailActivatePips,
    trailingDistancePips: limits.trailDistancePips,
    lockoutHours: null,
    exitReason: mapExitReason(args.exitLabel, args.exitReason),
    mfe: null,
    mae: null,
    mfePips: null,
    maePips: null,
    initialRiskUsd,
    rMultiple: null,
  };
}

export function finalizeClosedTrade(trade: ClosedTrade, realizedPnL: number): ClosedTrade {
  const rMultiple =
    trade.initialRiskUsd != null && trade.initialRiskUsd > 0
      ? realizedPnL / trade.initialRiskUsd
      : null;
  return { ...trade, realizedPnL, rMultiple };
}

export function buildJournalEntry(args: {
  pair: string;
  event: JournalEventType;
  source: JournalSource;
  notes: string;
  direction?: Position['side'] | null;
  units?: number | null;
  price?: number | null;
  pnl?: number | null;
  pips?: number | null;
  timestamp?: number;
}): JournalEntry {
  return {
    id: uid('jn'),
    timestamp: args.timestamp ?? Date.now(),
    pair: args.pair,
    event: args.event,
    direction: args.direction ?? null,
    units: args.units ?? null,
    price: args.price ?? null,
    pnl: args.pnl ?? null,
    pips: args.pips ?? null,
    source: args.source,
    notes: args.notes,
  };
}

export function journalEventFromClose(label: string): JournalEventType {
  const u = label.toUpperCase();
  if (u.includes('BOOK')) return 'CLOSE BOOK';
  if (u.includes('REDUCE')) return 'REDUCE';
  if (u.includes('ADD')) return 'ADD';
  return 'CLOSE';
}
