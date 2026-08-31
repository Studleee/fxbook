import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData } from 'lightweight-charts';
import { downsampleEquitySnapshots } from '../../analytics/equityHistory';
import { chartTheme } from '../../theme';
import { useTerminalStore } from '../../store';

export function EquityCurveChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const ddSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const snapshots = useTerminalStore((s) => s.equitySnapshots);
  const meta = useTerminalStore((s) => s.equityHistoryMeta);
  const theme = useTerminalStore((s) => s.theme);
  const [mode, setMode] = useState<'equity' | 'drawdown'>('equity');

  const chartData = useMemo(
    () => downsampleEquitySnapshots([...snapshots].sort((a, b) => a.timestamp - b.timestamp)),
    [snapshots],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const colors = chartTheme();
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 180,
      layout: {
        background: { color: colors.bg },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.line },
      timeScale: { borderColor: colors.line },
    });
    const equitySeries = chart.addAreaSeries({
      lineColor: colors.blue,
      topColor: 'rgba(91, 159, 212, 0.35)',
      bottomColor: 'rgba(91, 159, 212, 0.02)',
      lineWidth: 2,
      visible: true,
    });
    const ddSeries = chart.addAreaSeries({
      lineColor: colors.red,
      topColor: 'rgba(239, 91, 103, 0.25)',
      bottomColor: 'rgba(239, 91, 103, 0.02)',
      lineWidth: 2,
      visible: false,
    });
    chartRef.current = chart;
    equitySeriesRef.current = equitySeries;
    ddSeriesRef.current = ddSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      equitySeriesRef.current = null;
      ddSeriesRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    equitySeriesRef.current?.applyOptions({ visible: mode === 'equity' });
    ddSeriesRef.current?.applyOptions({ visible: mode === 'drawdown' });
  }, [mode]);

  useEffect(() => {
    if (!equitySeriesRef.current || !ddSeriesRef.current) return;
    const equity: LineData[] = chartData.map((s) => ({
      time: Math.floor(s.timestamp / 1000) as LineData['time'],
      value: s.equity,
    }));
    const drawdown: LineData[] = chartData.map((s) => ({
      time: Math.floor(s.timestamp / 1000) as LineData['time'],
      value: s.drawdownPct,
    }));
    equitySeriesRef.current.setData(equity);
    ddSeriesRef.current.setData(drawdown);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  const label =
    meta.source === 'mixed'
      ? 'MIXED'
      : meta.source === 'oanda'
        ? 'OANDA TXN'
        : meta.source === 'csv'
          ? 'CSV'
          : meta.source === 'live'
            ? 'LIVE'
            : 'NO DATA';

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>EQUITY CURVE</span>
        <div className="ws-tabs">
          <button type="button" className={mode === 'equity' ? 'on' : ''} onClick={() => setMode('equity')}>
            EQUITY
          </button>
          <button
            type="button"
            className={mode === 'drawdown' ? 'on' : ''}
            onClick={() => setMode('drawdown')}
          >
            DRAWDOWN
          </button>
        </div>
        <span>{chartData.length ? label : 'NO DATA'}</span>
      </div>
      {!chartData.length ? (
        <div className="ws-note">
          Sync OANDA transactions or import a transaction CSV above. Live NAV samples append while
          connected.
        </div>
      ) : null}
      <div ref={containerRef} className="eq-chart" />
    </section>
  );
}
