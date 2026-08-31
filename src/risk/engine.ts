import type { Algo, Position, RiskPolicy, Side } from '../models';
import { calculatePips, getPipSize } from '../fx/pips';

export type RiskStatus = 'SAFE' | 'CAUTION' | 'LIMIT APPROACHING' | 'LOCKED';

export interface EffectiveLimits {
  aggressionPct: number;
  addUnits: number;
  positionUnits: number;
  maxSimultaneous: number;
  maxPairExposure: number;
  maxCurrencyPct: number;
  dailyRiskPct: number;
  maxDrawdownPct: number;
  maxOpenMarginPct: number;
  hardStopPips: number;
  trailActivatePips: number;
  trailDistancePips: number;
  maxDurationMin: number;
  breakEvenPips: number | null;
  lockDurationMs: number;
  cooldownAfterStopMs: number;
  maxConsecutiveLosses: number;
  maxLossPerTrade: number;
}

export interface CurrencyBook {
  ccy: string;
  units: number;
  pct: number;
}

export interface AddGate {
  allowed: boolean;
  reason: string | null;
  addUnits: number;
}

export interface RiskSnapshot {
  status: RiskStatus;
  limits: EffectiveLimits;
  dailyLossUsedPct: number;
  drawdownUsedPct: number;
  marginUsedPct: number;
  positionsUsedPct: number;
  currencyUsedPct: number;
}

export type StopAction =
  | { type: 'none' }
  | { type: 'activate-trail'; trail: number }
  | { type: 'update-trail'; trail: number }
  | { type: 'break-even'; stop: number }
  | { type: 'hit-stop' }
  | { type: 'hit-trail' }
  | { type: 'time-stop' };

function roundTen(n: number): number {
  return Math.round(n / 10) * 10;
}

export function effectiveLimits(policy: RiskPolicy): EffectiveLimits {
  const a = Math.max(0, Math.min(100, policy.aggressionPct)) / 100;
  const scaled = (base: number, min = 0) => Math.max(min, base * a);
  return {
    aggressionPct: policy.aggressionPct,
    addUnits: a === 0 ? 0 : Math.max(10, roundTen(policy.baseAddUnits * a)),
    positionUnits: a === 0 ? 0 : Math.max(10, roundTen(policy.basePositionUnits * a)),
    maxSimultaneous: a === 0 ? 0 : Math.max(1, Math.round(scaled(policy.account.maxSimultaneous, 1))),
    maxPairExposure: Math.round(scaled(policy.pair.maxExposureUnits)),
    maxCurrencyPct: scaled(policy.currency.maxNetPct),
    dailyRiskPct: scaled(policy.account.maxDailyLossPct),
    maxDrawdownPct: scaled(policy.account.maxDrawdownPct),
    maxOpenMarginPct: scaled(policy.account.maxOpenMarginPct),
    hardStopPips: policy.trade.hardStopPips,
    trailActivatePips: policy.trade.trailActivatePips,
    trailDistancePips: policy.trade.trailDistancePips,
    maxDurationMin: policy.trade.maxDurationMin,
    breakEvenPips: policy.trade.breakEvenPips,
    lockDurationMs: policy.pair.lockDurationMin * 60_000,
    cooldownAfterStopMs: policy.pair.cooldownAfterStopMin * 60_000,
    maxConsecutiveLosses: policy.pair.maxConsecutiveLosses,
    maxLossPerTrade: scaled(policy.trade.maxLossPerTrade),
  };
}

export function unrealizedPips(pair: string, side: Side, entry: number, current: number): number {
  return calculatePips({ pair, side, entryPrice: entry, currentPrice: current });
}

export function currencyExposure(positions: Position[]): CurrencyBook[] {
  const net: Record<string, number> = {};
  for (const p of positions) {
    const [base, quote] = p.pair.split('/');
    const sign = p.side === 'LONG' ? 1 : -1;
    net[base] = (net[base] ?? 0) + sign * p.units;
    net[quote] = (net[quote] ?? 0) - sign * p.units;
  }
  const gross = Object.values(net).reduce((sum, v) => sum + Math.abs(v), 0) || 1;
  return Object.entries(net)
    .map(([ccy, units]) => ({ ccy, units, pct: (units / gross) * 100 }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

export function peakCurrencyPct(book: CurrencyBook[]): number {
  return book.reduce((m, row) => Math.max(m, Math.abs(row.pct)), 0);
}

export function riskSnapshot(args: {
  policy: RiskPolicy;
  dayPnl: number;
  equity: number;
  drawdownPct: number;
  marginUsedPct: number;
  openCount: number;
  positions: Position[];
}): RiskSnapshot {
  const limits = effectiveLimits(args.policy);
  const dailyLossPct = args.equity > 0 ? Math.max(0, -args.dayPnl / args.equity) * 100 : 0;
  const dd = Math.abs(Math.min(0, args.drawdownPct));
  const fx = currencyExposure(args.positions);
  const currencyUsed = peakCurrencyPct(fx);

  const ratio = (used: number, cap: number) => (cap <= 0 ? (used > 0 ? 2 : 0) : used / cap);
  const dailyLossUsedPct = ratio(dailyLossPct, limits.dailyRiskPct) * 100;
  const drawdownUsedPct = ratio(dd, limits.maxDrawdownPct) * 100;
  const marginUsedPct = ratio(args.marginUsedPct, limits.maxOpenMarginPct) * 100;
  const positionsUsedPct = ratio(args.openCount, limits.maxSimultaneous) * 100;
  const currencyUsedPct = ratio(currencyUsed, limits.maxCurrencyPct) * 100;

  const worst = Math.max(
    dailyLossUsedPct,
    drawdownUsedPct,
    marginUsedPct,
    positionsUsedPct,
    currencyUsedPct,
  );

  let status: RiskStatus = 'SAFE';
  if (args.policy.aggressionPct <= 0 || dailyLossUsedPct >= 100 || drawdownUsedPct >= 100) {
    status = 'LOCKED';
  } else if (worst >= 85) {
    status = 'LIMIT APPROACHING';
  } else if (worst >= 60) {
    status = 'CAUTION';
  }

  return {
    status,
    limits,
    dailyLossUsedPct,
    drawdownUsedPct,
    marginUsedPct,
    positionsUsedPct,
    currencyUsedPct,
  };
}

export function addGate(args: {
  policy: RiskPolicy;
  algo: Algo | undefined;
  position: Position | undefined;
  openCount: number;
  dayPnl: number;
  equity: number;
  drawdownPct: number;
  marginUsedPct: number;
  positions: Position[];
}): AddGate {
  const limits = effectiveLimits(args.policy);
  if (!args.algo) return { allowed: false, reason: 'No pair selected', addUnits: 0 };
  if (limits.addUnits <= 0) return { allowed: false, reason: 'Aggression 0% — entries frozen', addUnits: 0 };
  if (args.algo.status === 'LOCKED') return { allowed: false, reason: 'Pair locked', addUnits: limits.addUnits };
  if (args.algo.status === 'COOLDOWN') return { allowed: false, reason: 'Pair cooldown', addUnits: limits.addUnits };
  if (args.algo.status === 'DISABLED') return { allowed: false, reason: 'Pair disabled', addUnits: limits.addUnits };

  const snap = riskSnapshot(args);
  if (snap.status === 'LOCKED') {
    return { allowed: false, reason: 'Risk governor LOCKED — new entries blocked', addUnits: limits.addUnits };
  }
  if (args.marginUsedPct >= limits.maxOpenMarginPct) {
    return { allowed: false, reason: `Margin cap ${limits.maxOpenMarginPct.toFixed(0)}%`, addUnits: limits.addUnits };
  }
  if (!args.position && args.openCount >= limits.maxSimultaneous) {
    return { allowed: false, reason: `Max simultaneous ${limits.maxSimultaneous}`, addUnits: limits.addUnits };
  }

  const nextUnits = (args.position?.units ?? 0) + limits.addUnits;
  if (nextUnits > limits.maxPairExposure) {
    return {
      allowed: false,
      reason: `Pair exposure cap ${limits.maxPairExposure} u`,
      addUnits: limits.addUnits,
    };
  }

  const projected = args.position
    ? args.positions.map((p) => (p.id === args.position?.id ? { ...p, units: nextUnits } : p))
    : args.positions;
  const peak = peakCurrencyPct(currencyExposure(projected));
  if (peak > limits.maxCurrencyPct) {
    return {
      allowed: false,
      reason: `Currency exposure cap ${limits.maxCurrencyPct.toFixed(0)}%`,
      addUnits: limits.addUnits,
    };
  }

  return { allowed: true, reason: null, addUnits: limits.addUnits };
}

export function evaluateStop(pos: Position, policy: RiskPolicy, now: number): StopAction {
  const pip = getPipSize(pos.pair);
  const pips = unrealizedPips(pos.pair, pos.side, pos.entry, pos.current);
  const { trade } = policy;

  const stopHit = pos.side === 'LONG' ? pos.current <= pos.stop : pos.current >= pos.stop;
  if (stopHit) return { type: 'hit-stop' };

  if (pos.trail != null) {
    const trailHit = pos.side === 'LONG' ? pos.current <= pos.trail : pos.current >= pos.trail;
    if (trailHit) return { type: 'hit-trail' };
  }

  if ((now - pos.openedAt) / 60000 >= trade.maxDurationMin) return { type: 'time-stop' };

  if (trade.breakEvenPips != null && pips >= trade.breakEvenPips) {
    const be = pos.side === 'LONG' ? pos.entry + pip : pos.entry - pip;
    const better = pos.side === 'LONG' ? be > pos.stop : be < pos.stop;
    if (better) return { type: 'break-even', stop: be };
  }

  if (pips >= trade.trailActivatePips) {
    const trail =
      pos.side === 'LONG'
        ? pos.current - trade.trailDistancePips * pip
        : pos.current + trade.trailDistancePips * pip;
    if (pos.trail == null) return { type: 'activate-trail', trail };
    const improved = pos.side === 'LONG' ? trail > pos.trail : trail < pos.trail;
    if (improved) return { type: 'update-trail', trail };
  }

  return { type: 'none' };
}

export function stopPrice(pair: string, side: Side, entry: number, hardStopPips: number): number {
  const dist = getPipSize(pair) * hardStopPips;
  return side === 'LONG' ? entry - dist : entry + dist;
}
