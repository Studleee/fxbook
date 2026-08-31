import { useMemo } from 'react';
import { summarizeTrades } from '../../analytics/aggregate';
import { safeNum } from '../../analytics/math';
import { formatMoney, formatPct } from '../../format';
import { useTerminalStore } from '../../store';

export function AnalyticsOverview() {
  const closedTrades = useTerminalStore((s) => s.closedTrades);
  const equitySnapshots = useTerminalStore((s) => s.equitySnapshots);

  const m = useMemo(
    () => summarizeTrades(closedTrades, equitySnapshots),
    [closedTrades, equitySnapshots],
  );

  if (!m.hasData) {
    return (
      <section className="ws-panel">
        <div className="pane-h">
          <span>PORTFOLIO METRICS</span>
          <span>LIVE RECORDING</span>
        </div>
        <div className="ws-note">
          No closed trades recorded yet. Metrics populate when positions close in SIM (or when trade
          history is imported). Equity snapshots sample every 30s while the desk runs.
        </div>
      </section>
    );
  }

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>PORTFOLIO METRICS</span>
        <span>{m.totalTrades} TRADES</span>
      </div>
      <div className="ws-metrics ws-metrics-wide">
        <Metric k="NET P&L" v={formatMoney(m.netPnL)} signed />
        <Metric k="WIN RATE" v={m.winRate != null ? formatPct(m.winRate, 0) : 'N/A'} />
        <Metric k="PROFIT FACTOR" v={safeNum(m.profitFactor ?? NaN, 2)} />
        <Metric k="EXPECTANCY" v={m.expectancy != null ? formatMoney(m.expectancy) : 'N/A'} signed />
        <Metric k="PAYOFF" v={safeNum(m.payoffRatio ?? NaN, 2)} />
        <Metric k="AVG WIN" v={m.avgWinner != null ? formatMoney(m.avgWinner) : 'N/A'} />
        <Metric k="AVG LOSS" v={m.avgLoser != null ? formatMoney(m.avgLoser) : 'N/A'} />
        <Metric k="AVG PIPS" v={safeNum(m.avgPips ?? NaN, 1)} />
        <Metric k="AVG $ / TRADE" v={m.avgUsd != null ? formatMoney(m.avgUsd) : 'N/A'} />
        <Metric k="MAX DD" v={m.maxDrawdownPct != null ? formatPct(m.maxDrawdownPct) : 'N/A'} />
        <Metric k="SHARPE" v={safeNum(m.sharpe ?? NaN, 2)} />
        <Metric k="SORTINO" v={safeNum(m.sortino ?? NaN, 2)} />
        <Metric k="SQN" v={safeNum(m.sqn ?? NaN, 2)} />
        <Metric
          k="AVG HOLD"
          v={m.avgHoldMs != null ? `${Math.round(m.avgHoldMs / 60000)}m` : 'N/A'}
        />
      </div>
      <div className="ws-note">
        Sharpe/Sortino use per-trade USD P&L (not annualized). SQN requires R-multiples from stop
        distance when available.
      </div>
    </section>
  );
}

function Metric({ k, v, signed }: { k: string; v: string; signed?: boolean }) {
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ''));
  const cls = signed && Number.isFinite(n) ? (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat') : '';
  return (
    <div className="ws-metric">
      <span className="ws-metric-k">{k}</span>
      <span className={`ws-metric-v ${cls}`}>{v}</span>
    </div>
  );
}
