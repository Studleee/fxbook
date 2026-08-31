import type { Position, Quote, Side } from '../../models';
import { splitPair } from '../../fx/pips';

export type ProposedChangeType =
  | 'ADD_POSITION'
  | 'INCREASE_POSITION'
  | 'REDUCE_POSITION'
  | 'CLOSE_POSITION';

export interface ProposedBookChange {
  type: ProposedChangeType;
  pair: string;
  side: Side;
  units: number;
  positionId?: string;
}

export function normalizePair(pair: string): string {
  return pair.replace('_', '/').toUpperCase();
}

function quoteMid(quotes: Record<string, Quote>, pair: string): number {
  const q = quotes[pair];
  if (!q) return 0;
  return (q.bid + q.ask) / 2;
}

function syntheticPosition(args: {
  pair: string;
  side: Side;
  units: number;
  quotes: Record<string, Quote>;
}): Position {
  const price = quoteMid(args.quotes, args.pair) || 1;
  return {
    id: `sim-${args.pair}-${args.side}-${Date.now()}`,
    pair: args.pair,
    algoId: 'sim',
    strategy: 'SIMULATED',
    side: args.side,
    units: args.units,
    entry: price,
    current: price,
    stop: 0,
    trail: null,
    unrealizedPnl: 0,
    margin: 0,
    openedAt: Date.now(),
    status: 'ACTIVE',
  };
}

function matchesPosition(pos: Position, change: ProposedBookChange): boolean {
  if (change.positionId) return pos.id === change.positionId;
  return pos.pair === change.pair && pos.side === change.side;
}

/** Apply a hypothetical book change — does not mutate broker state. */
export function applyProposedChange(
  positions: Position[],
  change: ProposedBookChange,
  quotes: Record<string, Quote>,
): Position[] {
  const pair = normalizePair(change.pair);
  splitPair(pair); // validate

  switch (change.type) {
    case 'CLOSE_POSITION':
      return positions.filter((p) => !matchesPosition({ ...p, pair }, { ...change, pair }));

    case 'REDUCE_POSITION': {
      const next: Position[] = [];
      for (const pos of positions) {
        if (!matchesPosition(pos, { ...change, pair })) {
          next.push(pos);
          continue;
        }
        const remaining = pos.units - change.units;
        if (remaining > 0) next.push({ ...pos, units: remaining });
      }
      return next;
    }

    case 'INCREASE_POSITION': {
      let matched = false;
      const next = positions.map((pos) => {
        if (!matchesPosition(pos, { ...change, pair })) return pos;
        matched = true;
        return { ...pos, units: pos.units + change.units };
      });
      if (!matched) {
        return [syntheticPosition({ pair, side: change.side, units: change.units, quotes }), ...next];
      }
      return next;
    }

    case 'ADD_POSITION': {
      const existing = positions.find((p) => p.pair === pair && p.side === change.side);
      if (existing) {
        return positions.map((p) =>
          p.id === existing.id ? { ...p, units: p.units + change.units } : p,
        );
      }
      return [syntheticPosition({ pair, side: change.side, units: change.units, quotes }), ...positions];
    }

    default:
      return positions;
  }
}
