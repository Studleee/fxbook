import { useMemo } from 'react';
import { summarizeTrades } from '../../analytics/aggregate';
import { safeNum } from '../../analytics/math';
import { summarizeMfeMae } from '../../analytics/mfeMae';
import { sessionPerformance, trendRegimeFromCandles, volatilityRegimeFromCandles } from '../../analytics/regimes';
import { formatMoney } from '../../format';
import { useTerminalStore } from '../../store';

export function PairAnalyticsDetail() {
  const pair = useTerminalStore((s) => s.selectedAnalyticsPair);
  const closedTrades = useTerminalStore((s) => s.closedTrades);
  const candles = useTerminalStore((s) => s.candles);

  const trades = useMemo(
    () => (pair ? closedTrades.filter((t) => t.pair === pair) : []),
    [closedTrades, pair],
  );
  const summary = useMemo(() => summarizeTrades(trades, []), [trades]);
  const mfe = useMemo(() => summarizeMfeMae(trades), [trades]);
  const sessions = useMemo(() => sessionPerformance(trades), [trades]);

  const volRegime = pair ? volatilityRegimeFromCandles(candles[pair] ?? []) : 'NORMAL';
  const trendRegime = pair ? trendRegimeFromCandles(candles[pair] ?? []) : 'RANGING';

  if (!pair) {
    return (
      <section className="ws-panel">
        <div className="ws-note">Select a pair from the leaderboard for detail.</div>
      </section>
    );
  }

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>PAIR DETAIL — {pair}</span>
        <span>{trades.length} TRADES</span>
      </div>
      <div className="ws-metrics ws-metrics-wide">
        <Mini k="NET P&L" v={summary.hasData ? formatMoney(summary.netPnL) : 'N/A'} />
        <Mini k="WIN %" v={summary.winRate != null ? `${summary.winRate.toFixed(0)}%` : 'N/A'} />
        <Mini k="PF" v={safeNum(summary.profitFactor ?? NaN, 2)} />
        <Mini k="EXP" v={summary.expectancy != null ? formatMoney(summary.expectancy) : 'N/A'} />
        <Mini k="CURRENT VOL" v={volRegime} />
        <Mini k="CURRENT TREND" v={trendRegime} />
      </div>
      <div className="ws-subhead">SESSION PERFORMANCE (ENTRY TIME UTC)</div>
      <RegimeTable rows={sessions} />
      <div className="ws-subhead">MFE / MAE</div>
      <div className="ws-note">{mfe.reason}</div>
      {mfe.available && (
        <div className="ws-metrics">
          <Mini k="MED WIN MFE" v={safeNum(mfe.medianWinnerMfePips ?? NaN, 1)} />
          <Mini k="MED LOSS MAE" v={safeNum(mfe.medianLoserMaePips ?? NaN, 1)} />
          <Mini k="P75 MFE" v={safeNum(mfe.p75WinnerMfePips ?? NaN, 1)} />
          <Mini k="P90 MAE" v={safeNum(mfe.p90LoserMaePips ?? NaN, 1)} />
        </div>
      )}
    </section>
  );
}

function RegimeTable({
  rows,
}: {
  rows: Array<{
    regime: string;
    trades: number;
    expectancy: number | null;
    expectancyR: number | null;
    profitFactor: number | null;
    winRate: number | null;
  }>;
}) {
  return (
    <table className="grid ws-grid">
      <thead>
        <tr>
          <th>REGIME</th>
          <th>TRADES</th>
          <th>EXPECT</th>
          <th>EXP R</th>
          <th>PF</th>
          <th>WIN %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.regime}>
            <td>{r.regime}</td>
            <td>{r.trades}</td>
            <td>{r.expectancy != null ? formatMoney(r.expectancy) : 'N/A'}</td>
            <td>{safeNum(r.expectancyR ?? NaN, 2)}</td>
            <td>{safeNum(r.profitFactor ?? NaN, 2)}</td>
            <td>{r.winRate != null ? `${r.winRate.toFixed(0)}%` : 'N/A'}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={6} className="flat">
              N/A
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="ws-metric">
      <span className="ws-metric-k">{k}</span>
      <span className="ws-metric-v">{v}</span>
    </div>
  );
}
