import { useMemo } from 'react';
import { DESK_PAIRS } from '../../services/oanda/format';
import { calculateCorrelationMatrix } from '../../analytics/correlation';
import { detectCorrelatedClusters, mergeClustersIntoThemes } from '../../analytics/correlatedRisk';
import { calculatePortfolioConcentration } from '../../analytics/portfolio';
import { formatMoneyPlain, formatUnits } from '../../format';
import { useTerminalStore } from '../../store';

export function PortfolioConcentration() {
  const positions = useTerminalStore((s) => s.positions);
  const account = useTerminalStore((s) => s.account);
  const marginUsedPct = useTerminalStore((s) => s.account.marginUsedPct);
  const availableMargin = useTerminalStore((s) => s.availableMargin);
  const candles = useTerminalStore((s) => s.candles);
  const window = useTerminalStore((s) => s.correlationWindow);

  const snapshot = useMemo(() => {
    const pairs = [...new Set([...DESK_PAIRS, ...positions.map((p) => p.pair)])];
    const { matrix } = calculateCorrelationMatrix({ candlesByPair: candles, pairs, window });
    const clusters = mergeClustersIntoThemes(detectCorrelatedClusters({ positions, matrix }));
    return calculatePortfolioConcentration({
      positions,
      account,
      marginUsedPct,
      availableMarginPct: availableMargin,
      largestCluster: clusters[0] ?? null,
    });
  }, [positions, account, marginUsedPct, availableMargin, candles, window]);

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>PORTFOLIO CONCENTRATION</span>
        <span>{snapshot.openCount} OPEN</span>
      </div>
      <div className="ws-metrics">
        <Metric k="GROSS EXP" v={formatUnits(snapshot.grossExposureUnits)} />
        <Metric k="NET EXP" v={formatUnits(snapshot.netExposureUnits)} />
        <Metric k="MARGIN USED" v={`${snapshot.marginUsedPct.toFixed(0)}%`} />
        <Metric k="AVAIL MARGIN" v={`${snapshot.availableMarginPct.toFixed(0)}%`} />
        <Metric k="LONG / SHORT" v={`${snapshot.longCount} / ${snapshot.shortCount}`} />
        <Metric
          k="LARGEST PAIR"
          v={
            snapshot.largestPairExposure
              ? `${snapshot.largestPairExposure.pair} ${snapshot.largestPairExposure.pct.toFixed(0)}%`
              : 'N/A'
          }
        />
        <Metric
          k="LARGEST CCY"
          v={
            snapshot.largestCurrencyExposure
              ? `${snapshot.largestCurrencyExposure.currency} ${snapshot.largestCurrencyExposure.grossPct.toFixed(0)}%`
              : 'N/A'
          }
        />
        <Metric
          k="TOP CLUSTER"
          v={snapshot.largestCluster ? snapshot.largestCluster.label : 'N/A'}
        />
        <Metric k="MARGIN $" v={formatMoneyPlain(snapshot.marginUsed, 2, account.currency)} />
      </div>
    </section>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="ws-metric">
      <span className="ws-metric-k">{k}</span>
      <span className="ws-metric-v">{v}</span>
    </div>
  );
}
