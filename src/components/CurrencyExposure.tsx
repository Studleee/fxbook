import type { CSSProperties } from 'react';
import { formatPct, formatUnits, pnlClass } from '../format';
import { currencyExposure, effectiveLimits } from '../risk/engine';
import { useTerminalStore } from '../store';

export function CurrencyExposure() {
  const positions = useTerminalStore((s) => s.positions);
  const cap = useTerminalStore((s) => effectiveLimits(s.risk).maxCurrencyPct);
  const book = currencyExposure(positions);
  const maxAbs = Math.max(cap, ...book.map((r) => Math.abs(r.pct)), 1);

  return (
    <section className="cx">
      <div className="pane-h">
        <span>CURRENCY EXPOSURE</span>
        <span>CAP {cap.toFixed(0)}% NET</span>
      </div>
      <div className="cx-body">
        {book.length === 0 && <div className="ctrl-note">No open exposure</div>}
        {book.map((row) => (
          <button
            key={row.ccy}
            className="cx-row"
            type="button"
            onClick={() => {
              const pair = useTerminalStore
                .getState()
                .positions.find((p) => p.pair.includes(row.ccy));
              if (pair) useTerminalStore.getState().selectPair(pair.pair);
            }}
          >
            <span className="cx-ccy">{row.ccy}</span>
            <div className="cx-bar">
              <span
                className={`cx-fill ${pnlClass(row.pct)} ${row.pct >= 0 ? 'cx-pos' : 'cx-neg'}`}
                style={
                  {
                    '--cx-w': `${(Math.abs(row.pct) / maxAbs) * 50}%`,
                  } as CSSProperties
                }
              />
              <i className="cx-mid" />
            </div>
            <b className={pnlClass(row.pct)}>{formatPct(row.pct, 0)}</b>
            <span className="cx-u">{formatUnits(row.units)} u</span>
          </button>
        ))}
      </div>
    </section>
  );
}
