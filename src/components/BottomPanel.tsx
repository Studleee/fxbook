import { useCallback, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { BottomTab, TerminalEvent } from '../models';
import {
  formatAge,
  formatMoney,
  formatPrice,
  formatTime,
  formatUnits,
  pnlClass,
} from '../format';
import {
  calculatePositionFxMetrics,
  conversionRatesForBook,
  formatFxPips,
} from '../fx/pips';
import { useTerminalStore } from '../store';

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'positions', label: 'POSITIONS' },
  { id: 'execution-log', label: 'EXECUTION LOG' },
  { id: 'system-log', label: 'SYSTEM LOG' },
];

export function BottomPanel() {
  const height = useTerminalStore((s) => s.bottomHeight);
  const setHeight = useTerminalStore((s) => s.setBottomHeight);
  const tab = useTerminalStore((s) => s.bottomTab);
  const setTab = useTerminalStore((s) => s.setBottomTab);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      drag.current = { startY: e.clientY, startH: height };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const next = drag.current.startH + (drag.current.startY - e.clientY);
      const max = Math.round(window.innerHeight * 0.48);
      setHeight(Math.min(max, Math.max(128, next)));
    },
    [setHeight],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <section className="btm" style={{ '--btm-h': `${height}px` } as CSSProperties}>
      <div
        className="btm-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="btm-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="btm-body">
        {tab === 'positions' ? <PositionsTable /> : <EventTable tab={tab} />}
      </div>
    </section>
  );
}

function PositionsTable() {
  const positions = useTerminalStore((s) => s.positions);
  const quotes = useTerminalStore((s) => s.quotes);
  const dataSource = useTerminalStore((s) => s.dataSource);
  const selectedId = useTerminalStore((s) => s.selectedPositionId);
  const selectPosition = useTerminalStore((s) => s.selectPosition);
  const conversionRates = useMemo(
    () => conversionRatesForBook(quotes, positions),
    [quotes, positions],
  );

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>PAIR</th>
          <th>SIDE</th>
          <th>UNITS</th>
          <th>ENTRY</th>
          <th>CURRENT</th>
          <th>UNREALIZED</th>
          <th>PIPS</th>
          <th>MARGIN</th>
          <th>AGE</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const fx = calculatePositionFxMetrics({
            pair: p.pair,
            side: p.side,
            units: p.units,
            entryPrice: p.entry,
            currentPrice: p.current,
            stopPrice: p.stop,
            conversionRates,
            brokerUnrealizedPnl: dataSource === 'oanda' ? p.unrealizedPnl : undefined,
          });
          return (
          <tr
            key={p.id}
            className={p.id === selectedId ? 'sel' : ''}
            onClick={() => selectPosition(p.id)}
          >
            <td className="sans">{p.pair}</td>
            <td className={p.side === 'LONG' ? 'pos' : 'neg'}>{p.side}</td>
            <td>{formatUnits(p.units)}</td>
            <td>{formatPrice(p.pair, p.entry)}</td>
            <td>{formatPrice(p.pair, p.current)}</td>
            <td className={pnlClass(p.unrealizedPnl)}>{formatMoney(p.unrealizedPnl)}</td>
            <td className={pnlClass(fx.pips)}>{formatFxPips(fx.pips)}</td>
            <td>${p.margin.toFixed(1)}</td>
            <td>{formatAge(p.openedAt)}</td>
          </tr>
          );
        })}
        {positions.length === 0 && (
          <tr>
            <td colSpan={9} className="sans flat">
              No open positions
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function EventTable({ tab }: { tab: BottomTab }) {
  const events = useTerminalStore((s) => s.events);
  const selectPair = useTerminalStore((s) => s.selectPair);
  const filtered = events.filter((e) => matchesTab(e, tab));

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>TIME</th>
          <th>PAIR</th>
          <th>LABEL</th>
          <th>EVENT</th>
          <th>SOURCE</th>
          <th>REASON</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((e) => (
          <tr key={e.id} onClick={() => selectPair(e.pair)}>
            <td>{formatTime(e.timestamp)}</td>
            <td className="sans">{e.pair}</td>
            <td className="sans">{e.strategy}</td>
            <td className="sans">{e.event}</td>
            <td className="log-src">{e.source}</td>
            <td className="sans">{e.reason}</td>
          </tr>
        ))}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={6} className="sans flat">
              No events
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function matchesTab(e: TerminalEvent, tab: BottomTab): boolean {
  if (tab === 'execution-log') return e.source === 'BROKER' || /ENTRY|CLOSE|ADD|REDUCE|FLAT|POSITION/.test(e.event);
  if (tab === 'system-log') return e.source === 'SYSTEM';
  return true;
}
