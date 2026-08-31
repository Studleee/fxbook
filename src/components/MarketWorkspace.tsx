import { CHART_TIMEFRAMES } from '../chart/timeframes';
import { DESK_TIMEZONES, isDeskTimezone, timezoneIana } from '../chart/timezones';
import type { Candle } from '../models';
import { formatPrice, formatSpread } from '../format';
import { useTerminalStore } from '../store';
import { PriceChart } from './PriceChart';

const EMPTY_CANDLES: Candle[] = [];

export function MarketWorkspace() {
  const pair = useTerminalStore((s) => s.selectedPair);
  const quote = useTerminalStore((s) => s.quotes[s.selectedPair]);
  const candleMap = useTerminalStore((s) => s.candles);
  const candles = candleMap[pair] ?? EMPTY_CANDLES;
  const chartTf = useTerminalStore((s) => s.chartTf);
  const setChartTf = useTerminalStore((s) => s.setChartTf);
  const timezone = useTerminalStore((s) => s.timezone);
  const setTimezone = useTerminalStore((s) => s.setTimezone);
  const theme = useTerminalStore((s) => s.theme);
  const clock = useTerminalStore((s) => s.system.clock);
  const allPositions = useTerminalStore((s) => s.positions);
  const positions = allPositions.filter((p) => p.pair === pair);
  const env = useTerminalStore((s) => s.system.environment);
  const [base, quoteCcy] = pair.split('/');

  if (!quote) return <section className="mkt" />;

  return (
    <section className="mkt">
      <div className="mkt-head">
        <div>
          <div className="mkt-pair">
            {base} <span>/</span> {quoteCcy}
          </div>
        </div>
        <div className="mkt-quotes">
          <div className="mkt-q">
            <label>BID</label>
            <b className="neg">{formatPrice(pair, quote.bid)}</b>
          </div>
          <div className="mkt-q">
            <label>ASK</label>
            <b className="pos">{formatPrice(pair, quote.ask)}</b>
          </div>
          <div className="mkt-q">
            <label>SPREAD</label>
            <b>{formatSpread(quote.spreadPips)}</b>
          </div>
        </div>
      </div>
      <div className="mkt-chart">
        <div className="mkt-tf" role="group" aria-label="Chart timeframe">
          {CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              className={tf === chartTf ? 'on' : ''}
              onClick={() => setChartTf(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="mkt-clockbar">
          <span className="mkt-clock">{clock}</span>
          <select
            className="mkt-tz"
            aria-label="Chart timezone"
            value={timezone}
            onChange={(e) => {
              const hours = Number(e.target.value);
              if (isDeskTimezone(hours)) setTimezone(hours);
            }}
          >
            {DESK_TIMEZONES.map((tz) => (
              <option key={tz.hours} value={tz.hours}>
                {tz.menu}
              </option>
            ))}
          </select>
        </div>
        {env === 'LIVE' ? (
          <span className="sim-stamp live-stamp">LIVE</span>
        ) : (
          <span className="sim-stamp">{env === 'SIM' ? 'SIMULATED' : 'PAPER'}</span>
        )}
        <PriceChart
          pair={pair}
          timeframe={chartTf}
          timezone={timezoneIana(timezone)}
          theme={theme}
          candles={candles}
          positions={positions}
        />
      </div>
    </section>
  );
}
