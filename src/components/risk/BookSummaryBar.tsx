import { formatMoney } from '../../format';
import { safeNum } from '../../analytics/math';
import type { RiskWorkbenchResult } from '../../risk/portfolio/types';

export function BookSummaryBar({ workbench }: { workbench: RiskWorkbenchResult }) {
  const { bookSummary } = workbench;

  return (
    <section className="ws-panel risk-book-summary">
      <div className="pane-h">
        <span>BOOK SUMMARY</span>
      </div>
      <div className="ws-metrics">
        <Metric k="OPEN POSITIONS" v={String(bookSummary.openCount)} />
        <Metric k="GROSS EXPOSURE" v={fmt(bookSummary.grossExposure)} />
        <Metric k="NET EXPOSURE" v={fmt(bookSummary.netExposure)} />
        <Metric k="EQUITY" v={formatMoney(bookSummary.equity)} />
        <Metric
          k="GROSS LEVERAGE"
          v={
            bookSummary.grossLeverage != null
              ? `${safeNum(bookSummary.grossLeverage, 1)}x`
              : 'N/A'
          }
        />
      </div>
    </section>
  );
}

function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatMoney(v);
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="ws-metric">
      <span className="ws-metric-k">{k}</span>
      <span className="ws-metric-v">{v}</span>
    </div>
  );
}
