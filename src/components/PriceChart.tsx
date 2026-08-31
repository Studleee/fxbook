import { useEffect, useRef } from 'react';
import {
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type TickMarkType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatChartTime, formatMoney, formatUnits } from '../format';
import type { Candle, Position } from '../models';
import { chartTheme } from '../theme';

interface Props {
  pair: string;
  timeframe: string;
  timezone: string;
  theme: string;
  candles: Candle[];
  positions: Position[];
}

export function PriceChart({ pair, timeframe, timezone, theme, candles, positions = [] }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef(candles);
  const positionsRef = useRef(positions);
  const keyRef = useRef(`${pair}:${timeframe}:${candles[0]?.time ?? 'empty'}`);
  candlesRef.current = candles;
  positionsRef.current = positions;
  const overlayKey = positions
    .map(
      (p) =>
        `${p.id}:${p.side}:${p.units}:${p.entry}:${p.stop}:${p.trail ?? ''}:${p.openedAt}:${p.unrealizedPnl.toFixed(2)}`,
    )
    .join('|');

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    wrap.appendChild(host);

    const colors = chartTheme();
    const chart = createChart(host, {
      ...chartOptions(timezone, colors),
      width: Math.max(wrap.clientWidth, 1),
      height: Math.max(wrap.clientHeight, 1),
    });

    const series = chart.addCandlestickSeries(seriesOptions(colors));

    chartRef.current = chart;
    seriesRef.current = series;
    const initial = candlesRef.current;
    keyRef.current = `${pair}:${timeframe}:${initial[0]?.time ?? 'empty'}`;
    if (initial.length) series.setData(initial.map(toBar));
    applyPositionOverlay(series, initial, positionsRef.current, linesRef, colors);
    if (initial.length) chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 1 || h < 1) return;
      try {
        chart.applyOptions({ width: w, height: h });
      } catch {
        /* disposed */
      }
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      linesRef.current = [];
      try {
        chart.remove();
      } catch {
        /* already gone */
      }
      chartRef.current = null;
      seriesRef.current = null;
      host.remove();
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const key = `${pair}:${timeframe}:${candles[0]?.time ?? 'empty'}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      try {
        series.setData(candles.map(toBar));
        applyPositionOverlay(series, candles, positionsRef.current, linesRef, chartTheme());
        if (candles.length) chartRef.current?.timeScale().fitContent();
      } catch {
        /* stale series */
      }
      return;
    }
    if (!candles.length) return;
    try {
      series.update(toBar(candles[candles.length - 1]));
    } catch {
      try {
        series.setData(candles.map(toBar));
      } catch {
        /* stale series */
      }
    }
  }, [pair, timeframe, candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    applyPositionOverlay(series, candlesRef.current, positionsRef.current, linesRef, chartTheme());
  }, [overlayKey]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const colors = chartTheme();
    try {
      chart.applyOptions(chartOptions(timezone, colors));
      series.applyOptions(seriesOptions(colors));
      applyPositionOverlay(series, candlesRef.current, positionsRef.current, linesRef, colors);
    } catch {
      /* disposed */
    }
  }, [timezone, theme]);

  return <div ref={wrapRef} className="chart-host" />;
}

function chartTimeValue(time: Time): number | { year: number; month: number; day: number } {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') return Math.floor(new Date(time).getTime() / 1000);
  return time;
}

function chartLocalization(timeZone: string) {
  return {
    timeFormatter: (time: Time) => formatChartTime(chartTimeValue(time), timeZone),
  };
}

function chartTickFormatter(timeZone: string) {
  return (time: Time, tickMarkType: TickMarkType) =>
    formatChartTime(chartTimeValue(time), timeZone, tickMarkType);
}

function chartOptions(timeZone: string, colors: ReturnType<typeof chartTheme>) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: colors.bg },
      textColor: colors.text,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    rightPriceScale: {
      borderColor: colors.line,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    localization: chartLocalization(timeZone),
    timeScale: {
      borderColor: colors.line,
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: chartTickFormatter(timeZone),
    },
    crosshair: {
      vertLine: { color: colors.mute, width: 1 as const, style: 2 as const, labelBackgroundColor: colors.pane },
      horzLine: { color: colors.mute, width: 1 as const, style: 2 as const, labelBackgroundColor: colors.pane },
    },
  };
}

function seriesOptions(colors: ReturnType<typeof chartTheme>) {
  return {
    upColor: colors.green,
    downColor: colors.red,
    borderUpColor: colors.green,
    borderDownColor: colors.red,
    wickUpColor: colors.greenDim,
    wickDownColor: colors.redDim,
    priceLineVisible: true,
    priceLineColor: colors.blue,
    priceLineWidth: 1 as const,
    priceLineStyle: LineStyle.Solid,
    lastValueVisible: true,
  };
}

function applyPositionOverlay(
  series: ISeriesApi<'Candlestick'>,
  candles: Candle[],
  positions: Position[],
  linesRef: { current: IPriceLine[] },
  colors: ReturnType<typeof chartTheme>,
) {
  try {
    for (const line of linesRef.current) series.removePriceLine(line);
    linesRef.current = [];
    const markers: SeriesMarker<UTCTimestamp>[] = [];

    for (const pos of positions) {
      if (!Number.isFinite(pos.entry)) continue;
      const long = pos.side === 'LONG';
      const entryColor = long ? colors.green : colors.red;
      const label = `${formatMoney(pos.unrealizedPnl)}  ${pos.side} ${formatUnits(pos.units)}`;
      linesRef.current.push(
        series.createPriceLine({
          price: pos.entry,
          color: entryColor,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: label,
        }),
      );
      if (pos.stop > 0) {
        linesRef.current.push(
          series.createPriceLine({
            price: pos.stop,
            color: colors.red,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'STOP',
          }),
        );
      }
      if (pos.trail != null && pos.trail > 0) {
        linesRef.current.push(
          series.createPriceLine({
            price: pos.trail,
            color: colors.blue,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TRAIL',
          }),
        );
      }
      const time = markerTime(pos.openedAt, candles);
      if (time != null) {
        markers.push({
          time,
          position: long ? 'belowBar' : 'aboveBar',
          color: entryColor,
          shape: long ? 'arrowUp' : 'arrowDown',
          text: label,
        });
      }
    }

    series.setMarkers(markers);
  } catch {
    linesRef.current = [];
  }
}

function markerTime(openedAt: number, candles: Candle[]): UTCTimestamp | null {
  if (!candles.length) return null;
  const t = Math.floor(openedAt / 1000);
  if (t <= candles[0].time) return candles[0].time as UTCTimestamp;
  const last = candles[candles.length - 1];
  if (t >= last.time) return last.time as UTCTimestamp;
  let hit = candles[0];
  for (const c of candles) {
    if (c.time > t) break;
    hit = c;
  }
  return hit.time as UTCTimestamp;
}

function toBar(c: Candle) {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}
