import { create } from 'zustand';
import type {
  AccountState,
  Algo,
  BottomTab,
  Candle,
  Environment,
  EventSource,
  Order,
  PageId,
  Position,
  Quote,
  RiskPolicy,
  Side,
  SystemState,
  TerminalEvent,
} from './models';
import {
  buildCandleMap,
  ensureMockCorrelationCandles,
  INITIAL_ACCOUNT,
  INITIAL_ALGOS,
  INITIAL_EVENTS,
  INITIAL_ORDERS,
  INITIAL_POSITIONS,
  INITIAL_QUOTES,
} from './mock/seed';
import { INITIAL_RISK } from './mock/risk';
import {
  loadDeskTimezone,
  saveDeskTimezone,
  timezoneIana,
  timezoneLabel,
  type DeskTimezoneOffset,
} from './chart/timezones';
import { formatClock, formatMoney, positionPnl, setActiveTimeZone } from './format';
import {
  effectiveLimits,
  evaluateStop,
  stopPrice,
} from './risk/engine';
import {
  getCandles,
  getOpenBook,
  getPricing,
  getSummary,
  getTransactionsInRange,
  listAccounts,
  OandaHttpError,
} from './services/oanda/client';
import { pricingPairsFor } from './services/oanda/format';
import { loadOandaSettings, saveOandaSettings, clearOandaSettings } from './services/oanda/storage';
import { fetchSheetsAccount } from './sheets/account';
import { setPairValue } from './sheets/client';
import type { SheetWriteResult } from './sheets/types';
import { candleCountFor, timeframeSeconds, type ChartTimeframe } from './chart/timeframes';
import { applyDeskTheme, loadDeskTheme, saveDeskTheme, type DeskThemeId } from './theme';
import type { ClosedTrade, CorrelationWindow, EquitySnapshot, JournalEntry } from './analytics/types';
import {
  buildClosedTrade,
  buildJournalEntry,
  finalizeClosedTrade,
  journalEventFromClose,
  mapEventSource,
} from './analytics/tradeRecord';
import { enrichTradeMfeMae } from './analytics/mfeMae';
import { m5FetchCountForWindow } from './analytics/returns';
import {
  DEFAULT_EQUITY_SYNC_DAYS,
  deriveEquityHistoryMeta,
  importTransactionCsv,
  mergeEquitySnapshots,
  snapshotsFromOandaTransactions,
  type EquityHistoryMeta,
} from './analytics/equityHistory';
import {
  equityAccountKey,
  loadEquityHistory,
  saveEquityHistory,
  storedMeta,
} from './analytics/equityStorage';
import { calculatePips } from './fx/pips';

const EQUITY_SNAPSHOT_INTERVAL_MS = 30_000;
const MAX_CLOSED_TRADES = 500;
const MAX_JOURNAL = 500;

const QUIET_AFTER_USER_MS = 45_000;
const QUIET_AFTER_BOOK_MS = 120_000;

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const storedBroker = loadOandaSettings();
const storedTimezone = loadDeskTimezone();
const storedTheme = loadDeskTheme();
const storedEquityKey = equityAccountKey(storedBroker?.accountId);
const storedEquity = loadEquityHistory(storedEquityKey);
const initialEquitySnapshots = storedEquity?.snapshots ?? [];
const initialEquityMeta = deriveEquityHistoryMeta(initialEquitySnapshots, storedMeta(storedEquity));
setActiveTimeZone(timezoneIana(storedTimezone), timezoneLabel(storedTimezone));
applyDeskTheme(storedTheme);

function stubAlgo(pair: string): Algo {
  return {
    id: pair.replace('/', '').toLowerCase(),
    pair,
    strategy: 'OANDA',
    status: 'RUNNING',
    signal: 'NEUTRAL',
    health: 'HEALTHY',
    exposureUnits: 0,
    pnlToday: 0,
    lockReason: null,
    cooldownEndsAt: null,
    lastError: null,
    consecutiveLosses: 0,
    entryMode: 'AUTO',
    managementMode: 'HYBRID',
    exitMode: 'HYBRID',
    riskArmed: true,
    entryQuietUntil: 0,
    metrics: {
      lastN: 20,
      winRate: 0,
      profitFactor: 0,
      expectancyR: 0,
      avgWinR: 0,
      avgLossR: 0,
      rollingDrawdownPct: 0,
      state: 'HEALTHY',
    },
  };
}

function mergeAlgos(algos: Algo[], positions: Position[]): Algo[] {
  const next = [...algos];
  for (const p of positions) {
    if (!next.some((a) => a.pair === p.pair)) next.push(stubAlgo(p.pair));
  }
  return next.map((a) => ({
    ...a,
    exposureUnits: positions.find((pos) => pos.pair === a.pair)?.units ?? 0,
  }));
}

export function quoteMid(quote: Quote): number {
  return (quote.bid + quote.ask) / 2;
}

function derive(account: AccountState, positions: Position[]) {
  const fromBroker =
    account.nav != null &&
    account.nav > 0 &&
    account.marginUsed != null &&
    account.marginAvailable != null;
  const unrealized = fromBroker
    ? account.nav! - account.balance
    : positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const equity = fromBroker ? account.nav! : account.balance + unrealized;
  const marginUsed = fromBroker
    ? account.marginUsed!
    : positions.reduce((sum, p) => sum + (p.margin || 0), 0);
  const marginUsedPct = equity > 0 ? (marginUsed / equity) * 100 : 0;
  const availableMargin = fromBroker
    ? (account.marginAvailable! / equity) * 100
    : equity > 0
      ? Math.max(0, ((equity - marginUsed) / equity) * 100)
      : 100;
  const dayPnl = account.realizedToday + unrealized;
  const peakEquity = Math.max(account.peakEquity, equity);
  const drawdownPct = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;
  return {
    account: { ...account, peakEquity, marginUsedPct },
    equity,
    unrealized,
    dayPnl,
    drawdownPct,
    availableMargin,
    openCount: positions.length,
  };
}

function pushEvent(
  events: TerminalEvent[],
  partial: Omit<TerminalEvent, 'id' | 'timestamp'>,
): TerminalEvent[] {
  return [
    { id: uid('ev'), timestamp: Date.now(), ...partial },
    ...events,
  ].slice(0, 200);
}

function pushJournal(entries: JournalEntry[], entry: JournalEntry): JournalEntry[] {
  return [entry, ...entries].slice(0, MAX_JOURNAL);
}

function applyRealizeResult(
  state: { closedTrades: ClosedTrade[]; journal: JournalEntry[] },
  result: {
    account: AccountState;
    positions: Position[];
    algos: Algo[];
    events: TerminalEvent[];
    closedTrade: ClosedTrade;
    journalEntry: JournalEntry;
  },
) {
  return {
    account: result.account,
    positions: result.positions,
    algos: result.algos,
    events: result.events,
    closedTrades: [result.closedTrade, ...state.closedTrades].slice(0, MAX_CLOSED_TRADES),
    journal: pushJournal(state.journal, result.journalEntry),
  };
}

function persistEquityHistory(state: {
  brokerAccountId: string;
  equitySnapshots: EquitySnapshot[];
  equityHistoryMeta: EquityHistoryMeta;
}): void {
  saveEquityHistory({
    accountKey: equityAccountKey(state.brokerAccountId),
    snapshots: state.equitySnapshots,
    lastOandaSyncAt: state.equityHistoryMeta.lastOandaSyncAt,
    lastCsvImportAt: state.equityHistoryMeta.lastCsvImportAt,
    lastCsvFileName: state.equityHistoryMeta.lastCsvFileName,
    oandaSyncDays: state.equityHistoryMeta.oandaSyncDays,
  });
}

function makeEquitySnapshot(state: {
  account: AccountState;
  equity: number;
  unrealized: number;
  availableMargin: number;
  openCount: number;
  drawdownPct: number;
}): EquitySnapshot {
  return {
    timestamp: Date.now(),
    balance: state.account.balance,
    equity: state.equity,
    unrealizedPnL: state.unrealized,
    marginUsed: state.account.marginUsed ?? 0,
    availableMargin: state.availableMargin,
    openPositions: state.openCount,
    drawdownPct: state.drawdownPct,
    source: 'live',
  };
}

export interface TerminalStore {
  system: SystemState;
  account: AccountState;
  algos: Algo[];
  positions: Position[];
  orders: Order[];
  events: TerminalEvent[];
  quotes: Record<string, Quote>;
  candles: Record<string, Candle[]>;
  chartTf: ChartTimeframe;
  timezone: DeskTimezoneOffset;
  theme: DeskThemeId;
  risk: RiskPolicy;
  selectedPair: string;
  selectedPositionId: string | null;
  page: PageId;
  bottomTab: BottomTab;
  bottomHeight: number;
  pendingConfirm: 'force-flat' | 'close-book' | 'disarm-risk' | null;
  equity: number;
  unrealized: number;
  dayPnl: number;
  drawdownPct: number;
  availableMargin: number;
  openCount: number;
  dataSource: 'mock' | 'oanda';
  brokerEnv: 'PAPER' | 'LIVE';
  brokerToken: string;
  brokerAccountId: string;
  brokerAccounts: { id: string; alias?: string }[];
  brokerError: string | null;
  brokerBusy: boolean;
  brokerTick: number;
  lastFeedAt: number | null;
  brokerAlias: string;
  sheetsConnected: boolean;
  closedTrades: ClosedTrade[];
  equitySnapshots: EquitySnapshot[];
  equityHistoryMeta: EquityHistoryMeta;
  journal: JournalEntry[];
  correlationWindow: CorrelationWindow;
  correlationCandlesBusy: boolean;
  selectedAnalyticsPair: string | null;
  lastEquitySampleAt: number;

  selectedAlgo: () => Algo | undefined;
  selectedPosition: () => Position | undefined;
  selectPair: (pair: string) => void;
  selectPosition: (id: string) => void;
  setPage: (page: PageId) => void;
  setBottomTab: (tab: BottomTab) => void;
  setBottomHeight: (h: number) => void;
  setAggression: (pct: number) => void;
  patchRisk: (patch: (policy: RiskPolicy) => RiskPolicy) => void;
  tickClock: () => void;
  tickMarket: () => void;
  lockPair: (pair?: string) => void;
  unlockPair: (pair?: string) => void;
  sheetLockout: (hours: number) => Promise<SheetWriteResult>;
  closePosition: () => void;
  reducePosition: () => void;
  addToPosition: (side?: Side, units?: number) => void;
  requestForceFlat: () => void;
  requestCloseBook: () => void;
  requestDisarmRisk: () => void;
  cancelConfirm: () => void;
  confirmForceFlat: () => void;
  confirmCloseBook: () => void;
  confirmDisarmRisk: () => void;
  armRisk: () => void;
  setBrokerEnv: (env: 'PAPER' | 'LIVE') => void;
  setBrokerToken: (token: string) => void;
  setBrokerAccountId: (id: string) => void;
  loadBrokerAccounts: () => Promise<void>;
  connectBroker: () => Promise<void>;
  disconnectBroker: () => void;
  forgetBroker: () => void;
  pollBroker: () => Promise<void>;
  refreshCandles: (pair?: string) => Promise<void>;
  setChartTf: (tf: ChartTimeframe) => void;
  setTimezone: (offset: DeskTimezoneOffset) => void;
  setTheme: (id: DeskThemeId) => void;
  refreshSheetsStatus: () => Promise<void>;
  refreshCorrelationCandles: (pairs: string[], window: CorrelationWindow) => Promise<void>;
  setCorrelationWindow: (window: CorrelationWindow) => void;
  setSelectedAnalyticsPair: (pair: string | null) => void;
  setEquitySyncDays: (days: number) => void;
  importEquityCsv: (text: string, fileName: string) => { ok: boolean; error?: string; count: number };
  syncEquityFromOanda: (days?: number) => Promise<{ ok: boolean; error?: string; count: number }>;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  system: {
    environment: 'SIM',
    brokerName: 'MOCK BROKER',
    broker: 'connected',
    data: 'connected',
    engine: 'connected',
    clock: formatClock(),
  },
  algos: INITIAL_ALGOS,
  positions: INITIAL_POSITIONS,
  orders: INITIAL_ORDERS,
  events: INITIAL_EVENTS,
  quotes: { ...INITIAL_QUOTES },
  candles: buildCandleMap(),
  chartTf: 'M5',
  timezone: storedTimezone,
  theme: storedTheme,
  risk: INITIAL_RISK,
  selectedPair: 'AUD/JPY',
  selectedPositionId: 'pos-audjpy',
  page: 'desk',
  bottomTab: 'positions',
  bottomHeight: 216,
  pendingConfirm: null,
  dataSource: 'mock',
  sheetsConnected: false,
  brokerEnv: storedBroker?.environment ?? 'PAPER',
  brokerToken: storedBroker?.token ?? '',
  brokerAccountId: storedBroker?.accountId ?? '',
  brokerAccounts: [],
  brokerError: null,
  brokerBusy: false,
  brokerTick: 0,
  lastFeedAt: null,
  brokerAlias: '',
  closedTrades: [],
  equitySnapshots: initialEquitySnapshots,
  equityHistoryMeta: initialEquityMeta,
  journal: [],
  correlationWindow: '7D',
  correlationCandlesBusy: false,
  selectedAnalyticsPair: null,
  lastEquitySampleAt: 0,
  ...derive(INITIAL_ACCOUNT, INITIAL_POSITIONS),

  selectedAlgo: () => get().algos.find((a) => a.pair === get().selectedPair),
  selectedPosition: () => {
    const { selectedPositionId, positions, selectedPair } = get();
    if (selectedPositionId) {
      const hit = positions.find((p) => p.id === selectedPositionId);
      if (hit) return hit;
    }
    return positions.find((p) => p.pair === selectedPair);
  },

  selectPair: (pair) => {
    const pos = get().positions.find((p) => p.pair === pair);
    set({ selectedPair: pair, selectedPositionId: pos?.id ?? null, pendingConfirm: null });
    void get().refreshCandles(pair);
  },

  selectPosition: (id) => {
    const pos = get().positions.find((p) => p.id === id);
    if (!pos) return;
    set({
      selectedPositionId: id,
      selectedPair: pos.pair,
      pendingConfirm: null,
      bottomTab: 'positions',
    });
  },

  setPage: (page) => {
    if (page === 'positions') {
      set({
        page: 'desk',
        bottomTab: 'positions',
        bottomHeight: Math.max(get().bottomHeight, 280),
      });
      return;
    }
    set({ page, pendingConfirm: null });
  },

  setBottomTab: (bottomTab) => set({ bottomTab }),
  setBottomHeight: (h) => set({ bottomHeight: h }),

  setAggression: (pct) => {
    const aggressionPct = Math.max(0, Math.min(100, Math.round(pct)));
    set((s) => {
      if (s.risk.aggressionPct === aggressionPct) return {};
      return {
        risk: { ...s.risk, aggressionPct },
        events: pushEvent(s.events, {
          strategy: 'GOVERNOR',
          pair: 'BOOK',
          event: `AGGRESSION ${s.risk.aggressionPct}% → ${aggressionPct}%`,
          source: 'RISK ENGINE',
          reason: 'Governor set',
        }),
      };
    });
  },

  patchRisk: (patch) => {
    set((s) => ({ risk: patch(s.risk) }));
  },

  tickClock: () => {
    const now = Date.now();
    set((s) => {
      const equityPatch =
        now - s.lastEquitySampleAt >= EQUITY_SNAPSHOT_INTERVAL_MS
          ? (() => {
              const equitySnapshots = mergeEquitySnapshots(s.equitySnapshots, [
                makeEquitySnapshot(s),
              ]);
              const equityHistoryMeta = deriveEquityHistoryMeta(equitySnapshots, s.equityHistoryMeta);
              persistEquityHistory({
                brokerAccountId: s.brokerAccountId,
                equitySnapshots,
                equityHistoryMeta,
              });
              return {
                equitySnapshots,
                equityHistoryMeta,
                lastEquitySampleAt: now,
              };
            })()
          : {};
      return {
        ...equityPatch,
        system: { ...s.system, clock: formatClock() },
        algos: s.algos.map((a) => {
          if (!a.cooldownEndsAt || a.cooldownEndsAt > now) return a;
          if (a.lockReason === 'MANUAL LOCK') return a;
          if (a.status === 'COOLDOWN' || a.status === 'LOCKED') {
            return { ...a, status: 'RUNNING' as const, cooldownEndsAt: null, lockReason: null };
          }
          return a;
        }),
      };
    });
  },

  tickMarket: () => {
    if (get().dataSource === 'oanda') return;
    set((s) => {
      const quotes: Record<string, Quote> = { ...s.quotes };
      const candles: Record<string, Candle[]> = { ...s.candles };

      for (const pair of Object.keys(quotes)) {
        const q = quotes[pair];
        const pip = pair.includes('JPY') ? 0.01 : 0.0001;
        const midPx = quoteMid(q) + (Math.random() - 0.5) * pip * 1.8;
        const spread = Math.max(pip, q.spreadPips * pip);
        quotes[pair] = {
          bid: midPx - spread / 2,
          ask: midPx + spread / 2,
          spreadPips: Math.max(0.6, q.spreadPips + (Math.random() - 0.5) * 0.1),
        };

        const series = [...(candles[pair] ?? [])];
        if (!series.length) continue;
        const last = { ...series[series.length - 1] };
        const t = Math.floor(Date.now() / 1000);
        const bucket = t - (t % timeframeSeconds(s.chartTf ?? 'M5'));
        if (bucket > last.time) {
          series.push({
            time: bucket,
            open: last.close,
            high: Math.max(last.close, midPx),
            low: Math.min(last.close, midPx),
            close: midPx,
          });
          if (series.length > 240) series.shift();
        } else {
          last.close = midPx;
          last.high = Math.max(last.high, midPx);
          last.low = Math.min(last.low, midPx);
          series[series.length - 1] = last;
        }
        candles[pair] = series;
      }

      let positions = s.positions.map((p) => {
        const current = quoteMid(quotes[p.pair]);
        return {
          ...p,
          current,
          unrealizedPnl: positionPnl(p.pair, p.side, p.entry, current, p.units, quotes),
        };
      });

      let account = s.account;
      let algos = s.algos;
      let events = s.events;
      let closedTrades = s.closedTrades;
      let journal = s.journal;
      let selectedPositionId = s.selectedPositionId;
      const now = Date.now();

      for (const pos of [...positions]) {
        const live = positions.find((p) => p.id === pos.id);
        if (!live) continue;
        const owner = algos.find((a) => a.pair === live.pair);
        if (owner && !owner.riskArmed) continue;
        const action = evaluateStop(live, s.risk, now);
        if (action.type === 'none') continue;
        if (action.type === 'activate-trail') {
          positions = positions.map((p) =>
            p.id === live.id ? { ...p, trail: action.trail, status: 'TRAILING' } : p,
          );
          events = pushEvent(events, {
            strategy: live.strategy,
            pair: live.pair,
            event: 'TRAILING STOP ACTIVATED',
            source: 'RISK ENGINE',
            reason: `Profit ≥ ${s.risk.trade.trailActivatePips} pips`,
          });
          continue;
        }
        if (action.type === 'update-trail') {
          positions = positions.map((p) => (p.id === live.id ? { ...p, trail: action.trail } : p));
          continue;
        }
        if (action.type === 'break-even') {
          positions = positions.map((p) => (p.id === live.id ? { ...p, stop: action.stop } : p));
          events = pushEvent(events, {
            strategy: live.strategy,
            pair: live.pair,
            event: 'STOP TO BREAK-EVEN',
            source: 'RISK ENGINE',
            reason: `Profit ≥ ${s.risk.trade.breakEvenPips} pips`,
          });
          continue;
        }

        const closeKind =
          action.type === 'hit-stop' ? 'stop' : action.type === 'hit-trail' ? 'trail' : 'time';
        const closed = realize(account, positions, algos, events, live, {
          label:
            closeKind === 'stop'
              ? 'HARD STOP'
              : closeKind === 'trail'
                ? 'TRAILING STOP'
                : 'TIME STOP',
          reason:
            closeKind === 'stop'
              ? 'STOP LOSS'
              : closeKind === 'trail'
                ? 'Trail hit'
                : 'Max trade duration',
          source: 'RISK ENGINE',
          lock: closeKind === 'stop',
          lockMs: effectiveLimits(s.risk).lockDurationMs,
          maxConsecutiveLosses: s.risk.pair.maxConsecutiveLosses,
        }, quotes, s.risk, candles);
        const applied = applyRealizeResult({ closedTrades, journal }, closed);
        account = applied.account;
        positions = applied.positions;
        algos = applied.algos;
        events = applied.events;
        closedTrades = applied.closedTrades;
        journal = applied.journal;
        if (selectedPositionId === live.id) {
          selectedPositionId = positions.find((p) => p.pair === live.pair)?.id ?? null;
        }
      }

      algos = algos.map((a) => {
        const pos = positions.find((p) => p.pair === a.pair);
        return { ...a, exposureUnits: pos?.units ?? 0 };
      });

      return {
        quotes,
        candles,
        positions,
        algos,
        events,
        closedTrades,
        journal,
        selectedPositionId,
        ...derive(account, positions),
      };
    });
  },

  lockPair: (pair) => {
    const target = pair ?? get().selectedPair;
    const algo = get().algos.find((a) => a.pair === target);
    if (!algo || algo.status === 'LOCKED') return;
    const lockMs = effectiveLimits(get().risk).lockDurationMs;
    patchAlgo(
      set,
      algo.id,
      {
        status: 'LOCKED',
        signal: 'NEUTRAL',
        lockReason: 'MANUAL LOCK',
        cooldownEndsAt: Date.now() + lockMs,
      },
      {
        strategy: algo.strategy,
        pair: algo.pair,
        event: 'PAIR LOCKED',
        source: 'USER',
        reason: 'Manual lock',
      },
    );
  },

  unlockPair: (pair) => {
    const target = pair ?? get().selectedPair;
    const algo = get().algos.find((a) => a.pair === target);
    if (!algo || (algo.status !== 'LOCKED' && algo.status !== 'COOLDOWN')) return;
    const prior = algo.lockReason ?? algo.status;
    patchAlgo(
      set,
      algo.id,
      { status: 'RUNNING', lockReason: null, cooldownEndsAt: null },
      {
        strategy: algo.strategy,
        pair: algo.pair,
        event: 'USER OVERRIDE — UNLOCKED',
        source: 'USER',
        reason: `Override ${prior} → RUNNING`,
      },
    );
  },

  sheetLockout: async (hours) => {
    const pair = get().selectedPair;
    const algo = get().selectedAlgo();
    const result = await setPairValue(pair, 'lockoutHours', hours);
    if (!result.ok) {
      set((s) => ({
        events: pushEvent(s.events, {
          strategy: algo?.strategy ?? 'SHEETS',
          pair,
          event: 'SHEET LOCKOUT FAILED',
          source: 'SYSTEM',
          reason: result.error,
        }),
      }));
      return result;
    }
    if (hours <= 0) {
      const locked = algo && (algo.status === 'LOCKED' || algo.status === 'COOLDOWN');
      if (locked) get().unlockPair(pair);
      else {
        set((s) => ({
          events: pushEvent(s.events, {
            strategy: algo?.strategy ?? 'SHEETS',
            pair,
            event: 'SHEET UNLOCK',
            source: 'USER',
            reason: 'lockoutHours = 0',
          }),
        }));
      }
      return result;
    }
    if (algo) {
      patchAlgo(
        set,
        algo.id,
        {
          status: 'LOCKED',
          signal: 'NEUTRAL',
          lockReason: `SHEET LOCKOUT ${hours}h`,
          cooldownEndsAt: Date.now() + hours * 3_600_000,
        },
        {
          strategy: algo.strategy,
          pair: algo.pair,
          event: `SHEET LOCKOUT ${hours}h`,
          source: 'USER',
          reason: 'lockoutHours written',
        },
      );
    }
    return result;
  },

  closePosition: () => {
    if (get().dataSource === 'oanda') {
      blockExecution(set, get, 'CLOSE');
      return;
    }
    const pos = get().selectedPosition();
    if (!pos) return;
    flattenPosition(set, pos, {
      label: 'POSITION CLOSED',
      reason: 'Manual close',
      source: 'USER',
      lock: false,
      lockMs: 0,
    });
  },

  reducePosition: () => {
    if (get().dataSource === 'oanda') {
      blockExecution(set, get, 'REDUCE');
      return;
    }
    const pos = get().selectedPosition();
    if (!pos) return;
    const cut = Math.min(pos.units, effectiveLimits(get().risk).addUnits || 50);
    if (cut >= pos.units) {
      flattenPosition(set, pos, {
        label: 'POSITION CLOSED',
        reason: 'Reduce to flat',
        source: 'USER',
        lock: false,
        lockMs: 0,
      });
      return;
    }
    set((s) => {
      const current = quoteMid(s.quotes[pos.pair]);
      const realized = positionPnl(pos.pair, pos.side, pos.entry, current, cut, s.quotes);
      const units = pos.units - cut;
      const account: AccountState = {
        ...s.account,
        balance: s.account.balance + realized,
        realizedToday: s.account.realizedToday + realized,
      };
      const positions = s.positions.map((p) =>
        p.id === pos.id
          ? {
              ...p,
              units,
              current,
              unrealizedPnl: positionPnl(p.pair, p.side, p.entry, current, units, s.quotes),
            }
          : p,
      );
      return {
        ...derive(account, positions),
        positions,
        algos: s.algos.map((a) =>
          a.pair === pos.pair
            ? { ...a, exposureUnits: units, pnlToday: a.pnlToday + realized }
            : a,
        ),
        events: pushEvent(s.events, {
          strategy: pos.strategy,
          pair: pos.pair,
          event: `REDUCE −${cut}`,
          source: 'USER',
          reason: 'Manual reduce',
        }),
        pendingConfirm: null,
      };
    });
  },

  addToPosition: (side, units) => {
    if (get().dataSource === 'oanda') {
      blockExecution(set, get, 'ADD');
      return;
    }
    const s = get();
    const algo = s.selectedAlgo();
    const pos = s.selectedPosition();
    const quote = s.quotes[s.selectedPair];
    if (!quote || !algo) return;
    if (algo.status === 'LOCKED' || algo.status === 'COOLDOWN' || algo.status === 'DISABLED') return;
    const limits = effectiveLimits(s.risk);
    const chunk = Number.isFinite(units) && (units as number) > 0
      ? Math.round(units as number)
      : limits.addUnits;
    if (chunk <= 0) return;
    if (pos && side && pos.side !== side) return;
    const current = quoteMid(quote);

    if (pos) {
      const units = pos.units + chunk;
      const entry = (pos.entry * pos.units + current * chunk) / units;
      set((state) => {
        const positions = state.positions.map((p) =>
          p.id === pos.id
            ? {
                ...p,
                units,
                entry,
                current,
                unrealizedPnl: positionPnl(p.pair, p.side, entry, current, units, state.quotes),
              }
            : p,
        );
        return {
          ...derive(state.account, positions),
          positions,
          algos: state.algos.map((a) => (a.pair === pos.pair ? { ...a, exposureUnits: units } : a)),
          events: pushEvent(state.events, {
            strategy: pos.strategy,
            pair: pos.pair,
            event: `ADD +${chunk}`,
            source: 'USER',
            reason: `Governor add ${chunk} u @ ${limits.aggressionPct}%`,
          }),
        };
      });
      return;
    }

    if (side !== 'LONG' && side !== 'SHORT') return;
    const newPos: Position = {
      id: uid('pos'),
      pair: algo.pair,
      algoId: algo.id,
      strategy: algo.strategy,
      side,
      units: chunk,
      entry: current,
      current,
      stop: stopPrice(algo.pair, side, current, limits.hardStopPips),
      trail: null,
      unrealizedPnl: 0,
      margin: 3.2,
      openedAt: Date.now(),
      status: 'ACTIVE',
    };
    set((state) => {
      const positions = [newPos, ...state.positions];
      return {
        ...derive(state.account, positions),
        positions,
        selectedPositionId: newPos.id,
        algos: state.algos.map((a) => (a.id === algo.id ? { ...a, exposureUnits: chunk } : a)),
        events: pushEvent(state.events, {
          strategy: algo.strategy,
          pair: algo.pair,
          event: `ADD +${chunk} ${side} STOP ${limits.hardStopPips} pips`,
          source: 'USER',
          reason: `Initial hard stop ${limits.hardStopPips} pips`,
        }),
      };
    });
  },

  requestForceFlat: () => {
    if (!get().selectedPosition()) return;
    set({ pendingConfirm: 'force-flat' });
  },
  cancelConfirm: () => set({ pendingConfirm: null }),
  confirmForceFlat: () => {
    if (get().dataSource === 'oanda') {
      set({ pendingConfirm: null });
      blockExecution(set, get, 'FORCE FLAT');
      return;
    }
    const pos = get().selectedPosition();
    set({ pendingConfirm: null });
    if (pos) {
      flattenPosition(set, pos, {
        label: 'FORCE FLAT',
        reason: 'Emergency flatten',
        source: 'USER',
        lock: false,
        lockMs: 0,
        quietMs: QUIET_AFTER_USER_MS,
      });
    }
  },

  requestCloseBook: () => {
    if (!get().positions.length) return;
    set({ pendingConfirm: 'close-book' });
  },
  confirmCloseBook: () => {
    set({ pendingConfirm: null });
    if (get().dataSource === 'oanda') {
      blockExecution(set, get, 'CLOSE BOOK');
      return;
    }
    set((s) => {
      let account = s.account;
      let positions = s.positions;
      let algos = s.algos;
      let events = s.events;
      let closedTrades = s.closedTrades;
      let journal = s.journal;
      const quietUntil = Date.now() + QUIET_AFTER_BOOK_MS;
      for (const pos of [...positions]) {
        const quote = s.quotes[pos.pair];
        const live = {
          ...pos,
          current: quote ? quoteMid(quote) : pos.current,
        };
        live.unrealizedPnl = positionPnl(
          live.pair,
          live.side,
          live.entry,
          live.current,
          live.units,
          s.quotes,
        );
        const closed = realize(account, positions, algos, events, live, {
          label: 'BOOK FLAT',
          reason: 'Close book',
          source: 'USER',
          lock: false,
          lockMs: 0,
          quietMs: QUIET_AFTER_BOOK_MS,
        }, s.quotes, s.risk, s.candles);
        const applied = applyRealizeResult({ closedTrades, journal }, closed);
        account = applied.account;
        positions = applied.positions;
        algos = applied.algos;
        events = applied.events;
        closedTrades = applied.closedTrades;
        journal = applied.journal;
      }
      algos = algos.map((a) => ({ ...a, entryQuietUntil: Math.max(a.entryQuietUntil, quietUntil) }));
      events = pushEvent(events, {
        strategy: 'BOOK',
        pair: 'BOOK',
        event: 'CLOSE BOOK',
        source: 'USER',
        reason: 'Emergency flatten all strategies',
      });
      return {
        ...derive(account, positions),
        positions,
        algos,
        events,
        closedTrades,
        journal,
        selectedPositionId: null,
        pendingConfirm: null,
      };
    });
  },

  requestDisarmRisk: () => {
    const algo = get().selectedAlgo();
    if (!algo || !algo.riskArmed) return;
    set({ pendingConfirm: 'disarm-risk' });
  },
  armRisk: () => {
    const algo = get().selectedAlgo();
    if (!algo || algo.riskArmed) return;
    patchAlgo(set, algo.id, { riskArmed: true }, {
      strategy: algo.strategy,
      pair: algo.pair,
      event: 'RISK ARMED',
      source: 'USER',
      reason: 'Stops restored',
    });
  },
  confirmDisarmRisk: () => {
    const algo = get().selectedAlgo();
    set({ pendingConfirm: null });
    if (!algo) return;
    patchAlgo(set, algo.id, { riskArmed: false }, {
      strategy: algo.strategy,
      pair: algo.pair,
      event: 'RISK DISARMED',
      source: 'USER',
      reason: 'Advanced override — stops off for this pair',
    });
  },

  setBrokerEnv: (env) => set({ brokerEnv: env, brokerError: null, brokerAccounts: [] }),
  setBrokerToken: (token) => set({ brokerToken: token, brokerError: null }),
  setBrokerAccountId: (id) => set({ brokerAccountId: id, brokerError: null }),

  loadBrokerAccounts: async () => {
    const { brokerEnv, brokerToken } = get();
    if (!brokerToken.trim()) {
      set({ brokerError: 'Paste your OANDA API token first.' });
      return;
    }
    set({ brokerBusy: true, brokerError: null });
    try {
      const accounts = await listAccounts(brokerEnv, brokerToken);
      const mapped = accounts.map((a) => ({ id: a.id, alias: a.tags?.[0] }));
      set({
        brokerAccounts: mapped,
        brokerAccountId: get().brokerAccountId || mapped[0]?.id || '',
        brokerBusy: false,
        events: pushEvent(get().events, {
          strategy: 'OANDA',
          pair: 'BOOK',
          event: `LOADED ${mapped.length} ACCOUNT${mapped.length === 1 ? '' : 'S'}`,
          source: 'BROKER',
          reason: brokerEnv,
        }),
      });
    } catch (err) {
      set({
        brokerBusy: false,
        brokerError: err instanceof Error ? err.message : 'Could not list accounts',
      });
    }
  },

  connectBroker: async () => {
    const { brokerEnv, brokerToken, brokerAccountId, selectedPair } = get();
    if (!brokerToken.trim()) {
      set({ brokerError: 'API token is required.' });
      return;
    }
    if (!brokerAccountId.trim()) {
      set({ brokerError: 'Account ID is required. Load accounts or paste it.' });
      return;
    }
    set({
      brokerBusy: true,
      brokerError: null,
      system: {
        ...get().system,
        environment: brokerEnv,
        brokerName: brokerEnv === 'LIVE' ? 'OANDA LIVE' : 'OANDA PAPER',
        broker: 'degraded',
        data: 'degraded',
      },
    });
    try {
      const [summary, positions, candles] = await Promise.all([
        getSummary(brokerEnv, brokerToken, brokerAccountId),
        getOpenBook(brokerEnv, brokerToken, brokerAccountId),
        getCandles(
          brokerEnv,
          brokerToken,
          selectedPair,
          brokerAccountId,
          get().chartTf,
          candleCountFor(get().chartTf),
        ),
      ]);
      const quotes = await getPricing(
        brokerEnv,
        brokerToken,
        brokerAccountId,
        pricingPairsFor(positions),
      );
      const account: AccountState = {
        currency: summary.currency,
        balance: summary.balance,
        realizedToday: summary.resettable,
        totalReturnPct:
          summary.balance !== 0
            ? ((summary.nav - summary.balance + summary.realizedAll) /
                Math.max(Math.abs(summary.balance), 1)) *
              100
            : 0,
        maxDrawdownPct: get().account.maxDrawdownPct,
        peakEquity: Math.max(get().account.peakEquity, summary.nav),
        nav: summary.nav,
        marginUsed: summary.marginUsed,
        marginAvailable: summary.marginAvailable,
        marginUsedPct: 0,
      };
      const priced = positions.map((p) => {
        const q = quotes[p.pair];
        const current = q ? quoteMid(q) : p.current || p.entry;
        return {
          ...p,
          current,
          unrealizedPnl: p.unrealizedPnl || positionPnl(p.pair, p.side, p.entry, current, p.units, quotes),
        };
      });
      saveOandaSettings({
        environment: brokerEnv,
        token: brokerToken.trim(),
        accountId: brokerAccountId.trim(),
      });
      const accountKey = equityAccountKey(brokerAccountId.trim());
      const storedForAccount = loadEquityHistory(accountKey);
      const baseEquity = storedForAccount?.snapshots ?? get().equitySnapshots;
      set((s) => ({
        dataSource: 'oanda',
        brokerBusy: false,
        brokerError: null,
        brokerTick: 0,
        lastFeedAt: Date.now(),
        brokerAlias: summary.alias,
        quotes: { ...s.quotes, ...quotes },
        candles: { ...s.candles, [selectedPair]: candles.length ? candles : s.candles[selectedPair] },
        positions: priced,
        selectedPositionId: priced.find((p) => p.pair === selectedPair)?.id ?? priced[0]?.id ?? null,
        algos: mergeAlgos(s.algos, priced),
        orders: [],
        equitySnapshots: baseEquity,
        equityHistoryMeta: deriveEquityHistoryMeta(
          baseEquity,
          storedMeta(storedForAccount) ?? s.equityHistoryMeta,
        ),
        system: {
          ...s.system,
          environment: brokerEnv,
          brokerName: brokerEnv === 'LIVE' ? 'OANDA LIVE' : 'OANDA PAPER',
          broker: 'connected',
          data: 'connected',
          engine: 'connected',
        },
        events: pushEvent(s.events, {
          strategy: 'OANDA',
          pair: 'BOOK',
          event: `CONNECTED ${brokerEnv} ${brokerAccountId}`,
          source: 'BROKER',
          reason: 'Account / prices / positions streaming (data only)',
        }),
        ...derive(account, priced),
      }));
      void get().syncEquityFromOanda();
    } catch (err) {
      set((s) => ({
        brokerBusy: false,
        brokerError: err instanceof Error ? err.message : 'Connect failed',
        dataSource: 'mock',
        system: {
          ...s.system,
          environment: 'SIM',
          brokerName: 'MOCK BROKER',
          broker: 'disconnected',
          data: 'disconnected',
        },
      }));
    }
  },

  disconnectBroker: () => {
    set((s) => ({
      dataSource: 'mock',
      brokerBusy: false,
      brokerError: null,
      brokerTick: 0,
      lastFeedAt: null,
      brokerAlias: '',
      algos: INITIAL_ALGOS,
      positions: INITIAL_POSITIONS,
      orders: INITIAL_ORDERS,
      quotes: { ...INITIAL_QUOTES },
      candles: buildCandleMap(s.chartTf),
      selectedPair: 'AUD/JPY',
      selectedPositionId: 'pos-audjpy',
      closedTrades: [],
      journal: [],
      lastEquitySampleAt: 0,
      selectedAnalyticsPair: null,
      system: {
        ...s.system,
        environment: 'SIM' as Environment,
        brokerName: 'MOCK BROKER',
        broker: 'connected',
        data: 'connected',
        engine: 'connected',
      },
      events: pushEvent(s.events, {
        strategy: 'OANDA',
        pair: 'BOOK',
        event: 'DISCONNECTED — BACK TO SIM',
        source: 'SYSTEM',
        reason: 'Broker feed closed',
      }),
      ...derive(INITIAL_ACCOUNT, INITIAL_POSITIONS),
    }));
  },

  forgetBroker: () => {
    clearOandaSettings();
    get().disconnectBroker();
    set({ brokerToken: '', brokerAccountId: '', brokerAccounts: [], brokerError: null });
  },

  pollBroker: async () => {
    const s = get();
    if (s.dataSource !== 'oanda' || s.brokerBusy) return;
    const { brokerEnv, brokerToken, brokerAccountId } = s;
    if (!brokerToken || !brokerAccountId) return;
    try {
      const tick = s.brokerTick + 1;
      const pairs = pricingPairsFor(s.positions);
      const [quotes, summaryPack] = await Promise.all([
        getPricing(brokerEnv, brokerToken, brokerAccountId, pairs),
        getSummary(brokerEnv, brokerToken, brokerAccountId),
      ]);
      let book: Position[] | null = null;
      if (tick % 4 === 0) {
        book = await getOpenBook(brokerEnv, brokerToken, brokerAccountId);
      }
      set((state) => {
        if (state.dataSource !== 'oanda') return {};
        const mergedQuotes = { ...state.quotes, ...quotes };
        const candles = { ...state.candles };
        for (const [pair, q] of Object.entries(quotes)) {
          const series = [...(candles[pair] ?? [])];
          if (!series.length) continue;
          const last = { ...series[series.length - 1] };
          const midPx = quoteMid(q);
          const t = Math.floor(Date.now() / 1000);
          const bucket = t - (t % timeframeSeconds(state.chartTf ?? 'M5'));
          if (bucket > last.time) {
            series.push({
              time: bucket,
              open: last.close,
              high: Math.max(last.close, midPx),
              low: Math.min(last.close, midPx),
              close: midPx,
            });
            if (series.length > 240) series.shift();
          } else {
            last.close = midPx;
            last.high = Math.max(last.high, midPx);
            last.low = Math.min(last.low, midPx);
            series[series.length - 1] = last;
          }
          candles[pair] = series;
        }

        let positions = (book ?? state.positions).map((p) => {
          const q = mergedQuotes[p.pair];
          const current = q ? quoteMid(q) : p.current;
          return {
            ...p,
            current,
            unrealizedPnl:
              p.strategy === 'OANDA'
                ? p.unrealizedPnl
                : positionPnl(p.pair, p.side, p.entry, current, p.units, mergedQuotes),
          };
        });
        if (book) {
          positions = book.map((p) => {
            const q = mergedQuotes[p.pair];
            const current = q ? quoteMid(q) : p.current || p.entry;
            return {
              ...p,
              current,
              unrealizedPnl: p.unrealizedPnl || positionPnl(p.pair, p.side, p.entry, current, p.units, mergedQuotes),
            };
          });
        }

        const account: AccountState = {
          ...state.account,
          currency: summaryPack.currency,
          balance: summaryPack.balance,
          realizedToday: summaryPack.resettable,
          peakEquity: Math.max(state.account.peakEquity, summaryPack.nav),
          nav: summaryPack.nav,
          marginUsed: summaryPack.marginUsed,
          marginAvailable: summaryPack.marginAvailable,
        };

        return {
          quotes: mergedQuotes,
          candles,
          positions,
          algos: mergeAlgos(state.algos, positions),
          brokerTick: tick,
          lastFeedAt: Date.now(),
          brokerAlias: summaryPack?.alias || state.brokerAlias,
          system: { ...state.system, broker: 'connected', data: 'connected' },
          brokerError: null,
          ...derive(account, positions),
        };
      });
    } catch (err) {
      const status = err instanceof OandaHttpError ? err.status : 0;
      if (status === 401 || status === 403) {
        get().disconnectBroker();
        set({ brokerError: err instanceof Error ? err.message : 'Auth failed' });
        return;
      }
      set((state) => ({
        brokerError: err instanceof Error ? err.message : 'Feed error',
        system: { ...state.system, data: 'degraded', broker: 'degraded' },
      }));
    }
  },

  refreshCandles: async (pair) => {
    const s = get();
    if (s.dataSource !== 'oanda') return;
    const target = pair ?? s.selectedPair;
    try {
      const candles = await getCandles(
        s.brokerEnv,
        s.brokerToken,
        target,
        s.brokerAccountId,
        s.chartTf,
        candleCountFor(s.chartTf),
      );
      if (!candles.length) return;
      set((state) => ({ candles: { ...state.candles, [target]: candles } }));
    } catch {
      /* keep last candles */
    }
  },

  refreshCorrelationCandles: async (pairs, window) => {
    const s = get();
    const m5Count = m5FetchCountForWindow(window);
    const unique = [...new Set(pairs)];
    if (!unique.length) return;

    set({ correlationCandlesBusy: true });
    try {
      if (s.dataSource === 'oanda' && s.brokerToken && s.brokerAccountId) {
        const results = await Promise.all(
          unique.map(async (pair) => {
            try {
              const candles = await getCandles(
                s.brokerEnv,
                s.brokerToken,
                pair,
                s.brokerAccountId,
                'M5',
                m5Count,
              );
              return { pair, candles };
            } catch {
              return { pair, candles: s.candles[pair] ?? [] };
            }
          }),
        );
        set((state) => {
          const candles = { ...state.candles };
          for (const { pair, candles: series } of results) {
            if (series.length) candles[pair] = series;
          }
          return { candles, correlationCandlesBusy: false };
        });
        return;
      }

      set((state) => ({
        candles: ensureMockCorrelationCandles(unique, m5Count, state.candles),
        correlationCandlesBusy: false,
      }));
    } catch {
      set({ correlationCandlesBusy: false });
    }
  },

  setChartTf: (tf) => {
    if (get().chartTf === tf) return;
    if (get().dataSource === 'oanda') {
      const pair = get().selectedPair;
      set((s) => ({ chartTf: tf, candles: { ...s.candles, [pair]: [] } }));
      void get().refreshCandles();
      return;
    }
    set({ chartTf: tf, candles: buildCandleMap(tf) });
  },

  setTimezone: (offset) => {
    if (get().timezone === offset) return;
    saveDeskTimezone(offset);
    setActiveTimeZone(timezoneIana(offset), timezoneLabel(offset));
    set((s) => ({
      timezone: offset,
      system: { ...s.system, clock: formatClock() },
    }));
  },

  setTheme: (id) => {
    if (get().theme === id) return;
    saveDeskTheme(id);
    applyDeskTheme(id);
    set({ theme: id });
  },

  refreshSheetsStatus: async () => {
    const status = await fetchSheetsAccount();
    set({ sheetsConnected: Boolean(status.ok && status.configured) });
  },

  setCorrelationWindow: (window) => set({ correlationWindow: window }),
  setSelectedAnalyticsPair: (pair) => set({ selectedAnalyticsPair: pair }),

  setEquitySyncDays: (days) => {
    const oandaSyncDays = [7, 14, 30, 90].includes(days) ? days : DEFAULT_EQUITY_SYNC_DAYS;
    set((s) => {
      const equityHistoryMeta = { ...s.equityHistoryMeta, oandaSyncDays };
      persistEquityHistory({ ...s, equityHistoryMeta });
      return { equityHistoryMeta };
    });
  },

  importEquityCsv: (text, fileName) => {
    const result = importTransactionCsv(text);
    if (!result.snapshots.length) {
      set((s) => ({
        equityHistoryMeta: {
          ...s.equityHistoryMeta,
          message: result.error ?? 'CSV import failed.',
        },
      }));
      return { ok: false, error: result.error, count: 0 };
    }
    const s = get();
    const equitySnapshots = mergeEquitySnapshots(s.equitySnapshots, result.snapshots);
    const equityHistoryMeta = deriveEquityHistoryMeta(equitySnapshots, {
      ...s.equityHistoryMeta,
      lastCsvImportAt: Date.now(),
      lastCsvFileName: fileName,
      message: result.warning
        ? `Imported ${result.snapshots.length} points. ${result.warning}`
        : `Imported ${result.snapshots.length} points from ${fileName}.`,
    });
    set({ equitySnapshots, equityHistoryMeta });
    persistEquityHistory({ ...s, equitySnapshots, equityHistoryMeta });
    return { ok: true, count: result.snapshots.length };
  },

  syncEquityFromOanda: async (days) => {
    const s = get();
    const syncDays = days ?? s.equityHistoryMeta.oandaSyncDays ?? DEFAULT_EQUITY_SYNC_DAYS;
    if (s.dataSource !== 'oanda' || !s.brokerToken.trim() || !s.brokerAccountId.trim()) {
      const equityHistoryMeta = {
        ...s.equityHistoryMeta,
        message: 'Connect OANDA to sync transaction history.',
      };
      set({ equityHistoryMeta });
      return { ok: false, error: 'OANDA not connected', count: 0 };
    }
    try {
      const to = new Date();
      const from = new Date(to.getTime() - syncDays * 86_400_000);
      const transactions = await getTransactionsInRange(
        s.brokerEnv,
        s.brokerToken,
        s.brokerAccountId,
        from,
        to,
      );
      const imported = snapshotsFromOandaTransactions(transactions);
      if (!imported.length) {
        const equityHistoryMeta = {
          ...s.equityHistoryMeta,
          oandaSyncDays: syncDays,
          lastOandaSyncAt: Date.now(),
          message: `No balance transactions found in the last ${syncDays} days.`,
        };
        set({ equityHistoryMeta });
        persistEquityHistory({ ...s, equityHistoryMeta });
        return { ok: true, count: 0 };
      }
      const equitySnapshots = mergeEquitySnapshots(s.equitySnapshots, imported);
      const equityHistoryMeta = deriveEquityHistoryMeta(equitySnapshots, {
        ...s.equityHistoryMeta,
        oandaSyncDays: syncDays,
        lastOandaSyncAt: Date.now(),
        message: `Synced ${imported.length} balance points from OANDA (${syncDays}d).`,
      });
      set({ equitySnapshots, equityHistoryMeta });
      persistEquityHistory({ ...s, equitySnapshots, equityHistoryMeta });
      return { ok: true, count: imported.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OANDA sync failed';
      set((state) => ({
        equityHistoryMeta: { ...state.equityHistoryMeta, message },
      }));
      return { ok: false, error: message, count: 0 };
    }
  },
}));

function blockExecution(
  set: (fn: (s: TerminalStore) => Partial<TerminalStore>) => void,
  get: () => TerminalStore,
  action: string,
) {
  const algo = get().selectedAlgo();
  set((s) => ({
    events: pushEvent(s.events, {
      strategy: algo?.strategy ?? 'OANDA',
      pair: algo?.pair ?? 'BOOK',
      event: `${action} BLOCKED`,
      source: 'SYSTEM',
      reason: 'OANDA data mode — execution not enabled yet',
    }),
  }));
}

function patchAlgo(
  set: (fn: (s: TerminalStore) => Partial<TerminalStore>) => void,
  id: string,
  patch: Partial<Algo>,
  event: Omit<TerminalEvent, 'id' | 'timestamp'>,
) {
  set((s) => ({
    algos: s.algos.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    events: pushEvent(s.events, event),
    pendingConfirm: null,
  }));
}

interface CloseOpts {
  label: string;
  reason: string;
  source: EventSource;
  lock: boolean;
  lockMs: number;
  maxConsecutiveLosses?: number;
  quietMs?: number;
}

function realize(
  account: AccountState,
  positions: Position[],
  algos: Algo[],
  events: TerminalEvent[],
  pos: Position,
  opts: CloseOpts,
  quotes: Record<string, Quote> | undefined,
  risk: RiskPolicy,
  candles: Record<string, Candle[]>,
) {
  const current = pos.current;
  const realized = positionPnl(pos.pair, pos.side, pos.entry, current, pos.units, quotes);
  const nextAccount: AccountState = {
    ...account,
    balance: account.balance + realized,
    realizedToday: account.realizedToday + realized,
  };
  const nextPositions = positions.filter((p) => p.id !== pos.id);
  const loss = realized < 0;
  let nextAlgos = algos.map((a) => {
    if (a.pair !== pos.pair) return a;
    const consecutiveLosses = loss ? a.consecutiveLosses + 1 : 0;
    const locked = opts.lock;
    return {
      ...a,
      exposureUnits: 0,
      pnlToday: a.pnlToday + realized,
      consecutiveLosses,
      status: locked ? ('LOCKED' as const) : a.status,
      signal: locked ? ('NEUTRAL' as const) : a.signal,
      lockReason: locked ? opts.reason : a.lockReason,
      cooldownEndsAt: locked ? Date.now() + opts.lockMs : a.cooldownEndsAt,
      entryQuietUntil: Date.now() + (opts.quietMs ?? QUIET_AFTER_USER_MS),
    };
  });
  let nextEvents = pushEvent(events, {
    strategy: pos.strategy,
    pair: pos.pair,
    event: `${opts.label} ${formatMoney(realized)}`,
    source: opts.source,
    reason: opts.reason,
  });
  if (opts.lock) {
    nextEvents = pushEvent(nextEvents, {
      strategy: pos.strategy,
      pair: pos.pair,
      event: 'LOCKOUT STARTED',
      source: 'RISK ENGINE',
      reason: opts.reason,
    });
    const algo = nextAlgos.find((a) => a.pair === pos.pair);
    if (algo && opts.maxConsecutiveLosses && algo.consecutiveLosses >= opts.maxConsecutiveLosses) {
      nextAlgos = nextAlgos.map((a) =>
        a.pair === pos.pair ? { ...a, lockReason: 'Max consecutive losses' } : a,
      );
    }
  }
  const exitTime = Date.now();
  let closedTrade = finalizeClosedTrade(
    buildClosedTrade({
      position: pos,
      exitPrice: current,
      exitTime,
      exitLabel: opts.label,
      exitReason: opts.reason,
      risk,
      quotes,
    }),
    realized,
  );
  closedTrade = enrichTradeMfeMae(closedTrade, candles);
  const journalEntry = buildJournalEntry({
    pair: pos.pair,
    event: journalEventFromClose(opts.label),
    source: mapEventSource(opts.source),
    notes: opts.reason,
    direction: pos.side,
    units: pos.units,
    price: current,
    pnl: realized,
    pips: calculatePips({
      pair: pos.pair,
      side: pos.side,
      entryPrice: pos.entry,
      currentPrice: current,
    }),
    timestamp: exitTime,
  });
  return {
    account: nextAccount,
    positions: nextPositions,
    algos: nextAlgos,
    events: nextEvents,
    closedTrade,
    journalEntry,
  };
}

function flattenPosition(
  set: (fn: (s: TerminalStore) => Partial<TerminalStore>) => void,
  pos: Position,
  opts: CloseOpts,
) {
  set((s) => {
    const quote = s.quotes[pos.pair];
    const live = {
      ...pos,
      current: quote ? quoteMid(quote) : pos.current,
    };
    live.unrealizedPnl = positionPnl(
      live.pair,
      live.side,
      live.entry,
      live.current,
      live.units,
      s.quotes,
    );
    const closed = realize(s.account, s.positions, s.algos, s.events, live, opts, s.quotes, s.risk, s.candles);
    const applied = applyRealizeResult(s, closed);
    return {
      ...derive(applied.account, applied.positions),
      ...applied,
      selectedPositionId: applied.positions.find((p) => p.pair === pos.pair)?.id ?? null,
      pendingConfirm: null,
    };
  });
}

export function livePnlToday(algo: Algo, positions: Position[]): number {
  const pos = positions.find((p) => p.pair === algo.pair);
  return algo.pnlToday + (pos?.unrealizedPnl ?? 0);
}
