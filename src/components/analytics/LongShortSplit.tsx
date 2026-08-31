import { useMemo } from 'react';
import { longShortSplit } from '../../analytics/aggregate';
import { safeNum } from '../../analytics/math';
import { formatMoney, formatPct } from '../../format';
import { useTerminalStore } from '../../store';

export function LongShortSplit() {
  const closedTrades = useTerminalStore((s) => s.closedTrades);
  const split = useMemo(() => longShortSplit(closedTrades), [closedTrades]);

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>LONG VS SHORT</span>
      </div>
      <div className="ws-split">
        <SideBlock label="LONG" m={split.long} />
        <SideBlock label="SHORT" m={split.short} />
      </div>
    </section>
  );
}

function SideBlock({
  label,
  m,
}: {
  label: string;
  m: ReturnType<typeof longShortSplit>['long'];
}) {
  return (
    <div className="ws-split-col">
      <div className="ws-split-h">{label}</div>
      <div className="ws-metrics">
        <Mini k="TRADES" v={String(m.totalTrades)} />
        <Mini k="WIN %" v={m.winRate != null ? formatPct(m.winRate, 0) : 'N/A'} />
        <Mini k="P&L" v={m.hasData ? formatMoney(m.netPnL) : 'N/A'} />
        <Mini k="PF" v={safeNum(m.profitFactor ?? NaN, 2)} />
        <Mini k="EXP" v={m.expectancy != null ? formatMoney(m.expectancy) : 'N/A'} />
        <Mini k="AVG PIPS" v={safeNum(m.avgPips ?? NaN, 1)} />
      </div>
    </div>
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
