import type { Candle, Position, Quote } from '../../models';
import { pipSize } from '../../format';
import { fromInstrument, num, parseOandaTime } from './format';
import type { OandaAccountSummary, OandaCandle, OandaPosition, OandaPrice, OandaTrade } from './types';

export function mapQuote(price: OandaPrice): { pair: string; quote: Quote } | null {
  const pair = fromInstrument(price.instrument);
  const bid = num(price.bids?.[0]?.price ?? price.closeoutBid);
  const ask = num(price.asks?.[0]?.price ?? price.closeoutAsk);
  if (!bid || !ask) return null;
  const pip = pipSize(pair);
  return {
    pair,
    quote: {
      bid,
      ask,
      spreadPips: pip > 0 ? (ask - bid) / pip : 0,
    },
  };
}

export function mapCandles(rows: OandaCandle[]): Candle[] {
  const out: Candle[] = [];
  for (const row of rows) {
    const src = row.mid ?? row.bid;
    if (!src) continue;
    out.push({
      time: parseOandaTime(row.time),
      open: num(src.o),
      high: num(src.h),
      low: num(src.l),
      close: num(src.c),
    });
  }
  return out;
}

export function mapAccount(summary: OandaAccountSummary): {
  balance: number;
  nav: number;
  unrealized: number;
  realizedAll: number;
  resettable: number;
  marginUsed: number;
  marginAvailable: number;
  currency: string;
  alias: string;
} {
  const balance = num(summary.balance);
  const nav = num(summary.NAV);
  return {
    balance,
    nav,
    unrealized: num(summary.unrealizedPL) || nav - balance,
    realizedAll: num(summary.pl),
    resettable: num(summary.resettablePL),
    marginUsed: num(summary.marginUsed),
    marginAvailable: num(summary.marginAvailable),
    currency: summary.currency || 'USD',
    alias: summary.alias || summary.id,
  };
}

export function mapPositions(positions: OandaPosition[], trades: OandaTrade[]): Position[] {
  const tradeByInstrument = new Map<string, OandaTrade>();
  for (const t of trades) {
    if (!tradeByInstrument.has(t.instrument)) tradeByInstrument.set(t.instrument, t);
  }

  const out: Position[] = [];
  for (const p of positions) {
    const pair = fromInstrument(p.instrument);
    const trade = tradeByInstrument.get(p.instrument);
    const longU = num(p.long.units);
    const shortU = num(p.short.units);
    const sides: Array<{
      side: 'LONG' | 'SHORT';
      units: number;
      entry: number;
      pnl: number;
    }> = [];
    if (longU !== 0) {
      sides.push({
        side: 'LONG',
        units: Math.abs(longU),
        entry: num(p.long.averagePrice) || num(trade?.price),
        pnl: num(p.long.unrealizedPL),
      });
    }
    if (shortU !== 0) {
      sides.push({
        side: 'SHORT',
        units: Math.abs(shortU),
        entry: num(p.short.averagePrice) || num(trade?.price),
        pnl: num(p.short.unrealizedPL),
      });
    }
    for (const side of sides) {
      const current =
        side.entry && side.units
          ? side.entry
          : num(trade?.price) || side.entry;
      out.push({
        id: `oanda-${p.instrument}-${side.side}`,
        pair,
        algoId: pair.replace('/', '').toLowerCase(),
        strategy: 'OANDA',
        side: side.side,
        units: side.units,
        entry: side.entry,
        current,
        stop: num(trade?.stopLossOrder?.price),
        trail: num(trade?.trailingStopLossOrder?.trailingStopValue) || null,
        unrealizedPnl: side.pnl,
        margin: num(p.marginUsed),
        openedAt: trade?.openTime ? parseOandaTime(trade.openTime) * 1000 : Date.now(),
        status: trade?.trailingStopLossOrder ? 'TRAILING' : 'ACTIVE',
      });
    }
  }
  return out;
}
