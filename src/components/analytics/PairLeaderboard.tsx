import { useMemo, useState } from 'react';
import { pairLeaderboard } from '../../analytics/aggregate';
import { safeNum } from '../../analytics/math';
import { formatMoney, formatPct } from '../../format';
import { setPairValue } from '../../sheets/client';
import { useTerminalStore } from '../../store';

export function PairLeaderboard() {
  const closedTrades = useTerminalStore((s) => s.closedTrades);
  const sheetsConnected = useTerminalStore((s) => s.sheetsConnected);
  const setSelectedAnalyticsPair = useTerminalStore((s) => s.setSelectedAnalyticsPair);
  const selected = useTerminalStore((s) => s.selectedAnalyticsPair);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const rows = useMemo(() => pairLeaderboard(closedTrades), [closedTrades]);

  async function sheetAction(pair: string, setting: 'lockoutHours' | 'tradingEnabled', value: number | boolean) {
    setBusy(pair);
    setMsg('');
    const res = await setPairValue(pair, setting, value);
    setBusy(null);
    setMsg(res.ok ? `${pair} updated` : res.error ?? 'Write failed');
  }

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>PAIR LEADERBOARD</span>
        <span>{rows.length ? 'CLOSED TRADES' : 'N/A'}</span>
      </div>
      {msg && <div className="ws-note">{msg}</div>}
      <div className="ws-table-wrap">
        <table className="grid ws-grid">
          <thead>
            <tr>
              <th>PAIR</th>
              <th>TRADES</th>
              <th>P&L</th>
              <th>PIPS</th>
              <th>WIN %</th>
              <th>PF</th>
              <th>EXP</th>
              <th>AVG WIN</th>
              <th>AVG LOSS</th>
              <th>AVG HOLD</th>
              <th>STATUS</th>
              {sheetsConnected ? <th>ACTIONS</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.pair}
                className={selected === r.pair ? 'sel' : ''}
                onClick={() => setSelectedAnalyticsPair(r.pair)}
              >
                <td className="sans">{r.pair}</td>
                <td>{r.trades}</td>
                <td className={r.pnl >= 0 ? 'pos' : 'neg'}>{formatMoney(r.pnl)}</td>
                <td>{r.pips.toFixed(0)}</td>
                <td>{r.winRate != null ? formatPct(r.winRate, 0) : 'N/A'}</td>
                <td>{safeNum(r.profitFactor ?? NaN, 2)}</td>
                <td>{r.expectancy != null ? r.expectancy.toFixed(2) : 'N/A'}</td>
                <td>{r.avgWin != null ? formatMoney(r.avgWin) : 'N/A'}</td>
                <td>{r.avgLoss != null ? formatMoney(r.avgLoss) : 'N/A'}</td>
                <td>{r.avgHoldMs != null ? `${Math.round(r.avgHoldMs / 60000)}m` : 'N/A'}</td>
                <td className={`st-${r.status.toLowerCase()}`}>{r.status}</td>
                {sheetsConnected ? (
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-lock"
                        disabled={busy === r.pair}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sheetAction(r.pair, 'lockoutHours', 24);
                        }}
                      >
                        LOCK
                      </button>
                      <button
                        className="btn btn-warn"
                        disabled={busy === r.pair}
                        onClick={(e) => {
                          e.stopPropagation();
                          void sheetAction(r.pair, 'tradingEnabled', false);
                        }}
                      >
                        DISABLE
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={sheetsConnected ? 12 : 11} className="sans flat">
                  No closed trades — leaderboard fills as trades complete
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
