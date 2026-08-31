import { useEffect, useMemo, useState } from 'react';
import {
  formatCountdown,
  formatMoney,
  formatPrice,
  formatUnits,
  nextEligible,
  pnlClass,
} from '../format';
import {
  calculatePositionFxMetrics,
  conversionRatesForBook,
  formatFxPipValueUsd,
  formatFxPips,
} from '../fx/pips';
import { effectiveLimits } from '../risk/engine';
import { useTerminalStore } from '../store';
import { SheetLockout } from './SheetLockout';

export function AlgoControl() {
  const algo = useTerminalStore((s) => s.algos.find((a) => a.pair === s.selectedPair));
  const pos = useTerminalStore((s) => s.positions.find((p) => p.pair === s.selectedPair));
  const pending = useTerminalStore((s) => s.pendingConfirm);
  const clock = useTerminalStore((s) => s.system.clock);
  const risk = useTerminalStore((s) => s.risk);
  const positions = useTerminalStore((s) => s.positions);
  const addToPosition = useTerminalStore((s) => s.addToPosition);
  const requestCloseBook = useTerminalStore((s) => s.requestCloseBook);
  const cancelConfirm = useTerminalStore((s) => s.cancelConfirm);
  const confirmCloseBook = useTerminalStore((s) => s.confirmCloseBook);
  const dataSource = useTerminalStore((s) => s.dataSource);
  const quotes = useTerminalStore((s) => s.quotes);
  const limits = effectiveLimits(risk);
  const conversionRates = useMemo(
    () => conversionRatesForBook(quotes, positions),
    [quotes, positions],
  );
  const addUnits = limits.addUnits;
  const [longUnits, setLongUnits] = useState(String(addUnits));
  const [shortUnits, setShortUnits] = useState(String(addUnits));

  useEffect(() => {
    setLongUnits(String(addUnits));
    setShortUnits(String(addUnits));
  }, [algo?.pair, addUnits]);

  if (!algo) return null;

  const locked = algo.status === 'LOCKED' || algo.status === 'COOLDOWN';
  const hasPos = Boolean(pos);
  const oanda = dataSource === 'oanda';
  const tradingEnabled = !oanda && !locked && algo.status !== 'DISABLED';

  const parsedLong = Math.round(Number(longUnits));
  const parsedShort = Math.round(Number(shortUnits));
  const canAddLong = tradingEnabled && parsedLong > 0 && (!pos || pos.side === 'LONG');
  const canAddShort = tradingEnabled && parsedShort > 0 && (!pos || pos.side === 'SHORT');
  const fx = pos
    ? calculatePositionFxMetrics({
        pair: pos.pair,
        side: pos.side,
        units: pos.units,
        entryPrice: pos.entry,
        currentPrice: pos.current,
        stopPrice: pos.stop,
        trailDistancePips: limits.trailDistancePips,
        conversionRates,
        brokerUnrealizedPnl: oanda ? pos.unrealizedPnl : undefined,
      })
    : null;

  let noteLabel = 'LOCK REASON';
  let note = algo.lockReason;
  if (oanda) {
    noteLabel = 'BROKER';
    note = 'OANDA data connected — ADD/CLOSE/REDUCE are disabled until execution is enabled.';
  }

  return (
    <section className="ctrl">
      <div className="pane-h">
        <span>PAIR</span>
        <span>{algo.pair}</span>
      </div>
      <div className={`trade-lamp ${tradingEnabled ? 'on' : 'off'}`}>
        {tradingEnabled ? 'TRADING ENABLED' : 'TRADING DISABLED'}
      </div>
      <div className="ctrl-grid">
        <div className="ctrl-cell">
          <span className="ctrl-lbl">STATUS</span>
          <div className={`ctrl-val status-${algo.status}`}>
            {locked ? algo.status : hasPos ? 'OPEN' : 'FLAT'}
          </div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">DIRECTION</span>
          <div className="ctrl-val">{pos?.side ?? '—'}</div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">UNITS</span>
          <div className="ctrl-val">{pos ? formatUnits(pos.units) : '0'}</div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">AVERAGE PRICE</span>
          <div className="ctrl-val">{pos ? formatPrice(algo.pair, pos.entry) : '—'}</div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">UNREALIZED P&L</span>
          <div className={`ctrl-val ${pos ? pnlClass(pos.unrealizedPnl) : 'flat'}`}>
            {pos ? formatMoney(pos.unrealizedPnl) : '$0.00'}
          </div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">PIPS</span>
          <div className={`ctrl-val ${fx ? pnlClass(fx.pips) : 'flat'}`}>
            {fx ? formatFxPips(fx.pips) : '0.0'}
          </div>
        </div>
        <div className="ctrl-cell">
          <span className="ctrl-lbl">$ / PIP</span>
          <div className="ctrl-val">{fx ? formatFxPipValueUsd(fx.pipValueUSD) : '—'}</div>
        </div>
        {note ? (
          <div className="ctrl-cell span">
            <span className="ctrl-lbl">{noteLabel}</span>
            <div className="ctrl-note" data-clock={clock}>
              {note}
              {algo.cooldownEndsAt ? (
                <>
                  {' '}
                  · remaining {formatCountdown(algo.cooldownEndsAt)} · next {nextEligible(algo.cooldownEndsAt)}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="ctrl-actions">
        <input
          className="ctrl-add-in"
          type="number"
          min={1}
          step={1}
          value={longUnits}
          disabled={!tradingEnabled}
          aria-label="Add long units"
          onChange={(e) => setLongUnits(e.target.value)}
        />
        <input
          className="ctrl-add-in"
          type="number"
          min={1}
          step={1}
          value={shortUnits}
          disabled={!tradingEnabled}
          aria-label="Add short units"
          onChange={(e) => setShortUnits(e.target.value)}
        />
        <button
          className="btn"
          disabled={!canAddLong}
          onClick={() => addToPosition('LONG', parsedLong)}
        >
          ADD LONG
        </button>
        <button
          className="btn"
          disabled={!canAddShort}
          onClick={() => addToPosition('SHORT', parsedShort)}
        >
          ADD SHORT
        </button>
        <button
          className="btn btn-danger span-2"
          disabled={!positions.length || oanda}
          onClick={requestCloseBook}
        >
          CLOSE BOOK
        </button>
      </div>
      <SheetLockout pair={algo.pair} />
      {pending === 'close-book' && (
        <div className="confirm">
          <p>CLOSE BOOK — flatten every open position on the desk?</p>
          <div className="confirm-row">
            <button className="btn btn-danger" onClick={confirmCloseBook}>
              CONFIRM CLOSE BOOK
            </button>
            <button className="btn" onClick={cancelConfirm}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
