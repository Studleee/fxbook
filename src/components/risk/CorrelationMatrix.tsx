import { useEffect, useMemo, useState } from 'react';
import type { Candle } from '../../models';
import { DESK_PAIRS } from '../../services/oanda/format';
import {
  calculateCorrelationMatrix,
  correlationCell,
  describeCorrelationExposure,
} from '../../analytics/correlation';
import type { CorrelationWindow } from '../../analytics/types';
import { safeNum } from '../../analytics/math';
import { useTerminalStore } from '../../store';
import { CorrelationDetailPanel } from './CorrelationDetailPanel';

const WINDOWS: CorrelationWindow[] = ['24H', '7D', '30D', '90D'];
type PairFilter = 'ALL' | 'OPEN';

function pairLabel(pair: string): string {
  return pair.replace('/', '');
}

function cellHeatStyle(correlation: number | null): React.CSSProperties | undefined {
  if (correlation == null) return undefined;
  const abs = Math.abs(correlation);
  if (abs < 0.15) return undefined;
  const alpha = Math.min(0.42, 0.08 + abs * 0.34);
  if (correlation > 0) return { background: `rgba(91, 159, 212, ${alpha})` };
  return { background: `rgba(239, 91, 103, ${alpha})` };
}

function cellTitle(
  rowPair: string,
  colPair: string,
  correlation: number | null,
  observations: number,
  window: CorrelationWindow,
): string {
  const corr = correlation == null ? 'N/A' : safeNum(correlation, 2);
  return `${rowPair} ↔ ${colPair}\nCorrelation: ${corr}\nObservations: ${observations}\nWindow: ${window}`;
}

function snapshotCandles(
  source: Record<string, Candle[]>,
  pairs: string[],
): Record<string, Candle[]> {
  const out: Record<string, Candle[]> = {};
  for (const pair of pairs) {
    const series = source[pair];
    if (series?.length) out[pair] = series.map((c) => ({ ...c }));
  }
  return out;
}

export function CorrelationMatrix() {
  const positionPairsKey = useTerminalStore((s) =>
    [...new Set(s.positions.map((p) => p.pair))].sort().join('|'),
  );
  const allPairsKey = useTerminalStore((s) =>
    [...new Set([...DESK_PAIRS, ...s.positions.map((p) => p.pair)])].sort().join('|'),
  );
  const positions = useTerminalStore((s) => s.positions);
  const window = useTerminalStore((s) => s.correlationWindow);
  const setWindow = useTerminalStore((s) => s.setCorrelationWindow);
  const busy = useTerminalStore((s) => s.correlationCandlesBusy);
  const refreshCorrelationCandles = useTerminalStore((s) => s.refreshCorrelationCandles);

  const [pairFilter, setPairFilter] = useState<PairFilter>('ALL');
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const [corrCandles, setCorrCandles] = useState<Record<string, Candle[]>>({});
  const [corrNowSec, setCorrNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const pairs = useMemo(() => {
    const all = allPairsKey.split('|').filter(Boolean);
    if (pairFilter === 'OPEN') {
      const open = positionPairsKey.split('|').filter(Boolean);
      return open.length ? open : all;
    }
    return all;
  }, [allPairsKey, positionPairsKey, pairFilter]);

  const pairsKey = pairs.join('|');

  useEffect(() => {
    setSelA(null);
    setSelB(null);
    let cancelled = false;
    void refreshCorrelationCandles(pairs, window).then(() => {
      if (cancelled) return;
      const live = useTerminalStore.getState().candles;
      setCorrCandles(snapshotCandles(live, pairs));
      setCorrNowSec(Math.floor(Date.now() / 1000));
    });
    return () => {
      cancelled = true;
    };
  }, [window, pairsKey, pairs, refreshCorrelationCandles]);

  const { matrix, pairs: activePairs, spec, minObservations } = useMemo(
    () =>
      calculateCorrelationMatrix({
        candlesByPair: corrCandles,
        pairs,
        window,
        nowSec: corrNowSec,
      }),
    [corrCandles, pairs, window, corrNowSec],
  );

  const selection = useMemo(() => {
    if (!selA || !selB || selA === selB) return null;
    const cell = correlationCell(matrix, selA, selB);
    return describeCorrelationExposure({
      pairA: selA,
      pairB: selB,
      cell,
      positions,
    });
  }, [matrix, selA, selB, positions]);

  const obs24h = useMemo(() => {
    if (window !== '24H' || activePairs.length < 2) return null;
    const cell = correlationCell(matrix, activePairs[0], activePairs[1]);
    return cell?.observationCount ?? null;
  }, [matrix, activePairs, window]);

  return (
    <section className="ws-panel corr-matrix-panel">
      <div className="pane-h corr-matrix-h">
        <div className="corr-matrix-title">
          <span>CORRELATION MATRIX</span>
          <span className="corr-matrix-sub">
            {window} · {spec.returnLabel} RETURNS
            {obs24h != null ? ` · ~${obs24h} OBS` : ''}
          </span>
        </div>
        <div className="corr-matrix-controls">
          <div className="ws-tabs">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                className={window === w ? 'on' : ''}
                disabled={busy}
                onClick={() => setWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="ws-tabs">
            <button
              type="button"
              className={pairFilter === 'ALL' ? 'on' : ''}
              onClick={() => setPairFilter('ALL')}
            >
              ALL PAIRS
            </button>
            <button
              type="button"
              className={pairFilter === 'OPEN' ? 'on' : ''}
              onClick={() => setPairFilter('OPEN')}
            >
              OPEN BOOK
            </button>
          </div>
        </div>
      </div>

      {busy && !Object.keys(corrCandles).length ? (
        <div className="ws-note corr-loading">Loading correlation history…</div>
      ) : (
        <div className="corr-layout">
          <div className={`corr-matrix-area ${busy ? 'dim' : ''}`}>
            <table className="corr-grid">
              <thead>
                <tr>
                  <th className="corr-corner" />
                  {activePairs.map((p) => (
                    <th
                      key={p}
                      className={selA === p || selB === p ? 'corr-axis-sel' : ''}
                    >
                      {pairLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activePairs.map((rowPair) => (
                  <tr key={rowPair}>
                    <th className={selA === rowPair || selB === rowPair ? 'corr-axis-sel' : ''}>
                      {pairLabel(rowPair)}
                    </th>
                    {activePairs.map((colPair) => {
                      const cell = correlationCell(matrix, rowPair, colPair);
                      const isDiag = rowPair === colPair;
                      const selected =
                        (selA === rowPair && selB === colPair) ||
                        (selA === colPair && selB === rowPair);
                      const showValue =
                        isDiag || (cell?.sufficient && cell.correlation != null);
                      const display = isDiag
                        ? '1.00'
                        : showValue
                          ? safeNum(cell!.correlation, 2)
                          : 'N/A';
                      const observations = cell?.observationCount ?? 0;

                      return (
                        <td key={colPair} className={selected ? 'corr-td-sel' : ''}>
                          <button
                            type="button"
                            disabled={isDiag || busy}
                            className={`corr-cell ${isDiag ? 'corr-diag' : ''} ${selected ? 'sel' : ''}`}
                            style={!isDiag ? cellHeatStyle(cell?.correlation ?? null) : undefined}
                            title={
                              isDiag
                                ? undefined
                                : cellTitle(rowPair, colPair, cell?.correlation ?? null, observations, window)
                            }
                            onClick={() => {
                              if (isDiag) return;
                              setSelA(rowPair);
                              setSelB(colPair);
                            }}
                          >
                            {display}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ws-note corr-footnote">
              Pearson on log returns · min {minObservations} aligned observations · insufficient
              data shows N/A (not 0)
            </div>
          </div>
          <CorrelationDetailPanel selection={selection} />
        </div>
      )}
    </section>
  );
}
