import { useMemo } from 'react';
import { DESK_PAIRS } from '../../services/oanda/format';
import { calculateCorrelationMatrix } from '../../analytics/correlation';
import { detectCorrelatedClusters, mergeClustersIntoThemes } from '../../analytics/correlatedRisk';
import { safeNum } from '../../analytics/math';
import { useTerminalStore } from '../../store';

export function CorrelatedRiskPanel() {
  const positions = useTerminalStore((s) => s.positions);
  const candles = useTerminalStore((s) => s.candles);
  const window = useTerminalStore((s) => s.correlationWindow);
  const selectPosition = useTerminalStore((s) => s.selectPosition);
  const setPage = useTerminalStore((s) => s.setPage);

  const clusters = useMemo(() => {
    const pairs = [...new Set([...DESK_PAIRS, ...positions.map((p) => p.pair)])];
    const { matrix } = calculateCorrelationMatrix({ candlesByPair: candles, pairs, window });
    return mergeClustersIntoThemes(detectCorrelatedClusters({ positions, matrix }));
  }, [candles, positions, window]);

  const top = clusters[0];

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>CORRELATED POSITION RISK</span>
        <span className={top?.level === 'HIGH' ? 'neg' : top?.level === 'MEDIUM' ? 'flat' : 'pos'}>
          {top ? `${top.level} CLUSTER` : 'LOW'}
        </span>
      </div>
      <div className="ws-stack">
        {!clusters.length && <div className="ws-note">No correlated clusters detected in open book.</div>}
        {clusters.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`ws-cluster ws-cluster-${c.level.toLowerCase()}`}
            onClick={() => {
              setPage('desk');
              const id = c.positionIds[0];
              if (id) selectPosition(id);
            }}
          >
            <div className="ws-cluster-title">{c.label}</div>
            <div className="ws-cluster-meta">
              {c.pairs.join(' · ')} · {c.positionIds.length} positions ·{' '}
              {safeNum(c.exposurePct, 0)}% exposure · score {safeNum(c.score, 2)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
