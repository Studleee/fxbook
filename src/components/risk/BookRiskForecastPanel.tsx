import { formatMoney, formatPct } from '../../format';
import { safeNum } from '../../analytics/math';
import { formatVolChange } from '../../risk/factor/factorVol';
import type { RiskRegime } from '../../risk/factor/types';
import type { RiskWorkbenchResult } from '../../risk/portfolio/types';

interface Props {
  workbench: RiskWorkbenchResult;
}

const REGIME_STOPS: RiskRegime[] = ['LOW', 'NORMAL', 'HIGH', 'EXTREME'];

export function BookRiskForecastPanel({ workbench }: Props) {
  const snap = workbench.snapshot;

  if (!snap) {
    return (
      <section className="ws-panel risk-forecast-panel">
        <div className="pane-h">
          <span>BOOK RISK FORECAST</span>
        </div>
        <div className="risk-forecast-empty flat">INSUFFICIENT DATA — candle history required</div>
      </section>
    );
  }

  const regime = snap.regime;
  const regimeIdx = REGIME_STOPS.indexOf(regime === 'INSUFFICIENT_DATA' ? 'NORMAL' : regime);
  const regimePct = regimeIdx >= 0 ? (regimeIdx / (REGIME_STOPS.length - 1)) * 100 : 50;

  return (
    <section className="ws-panel risk-forecast-panel">
      <div className="pane-h">
        <span>BOOK RISK FORECAST</span>
        {!snap.dataComplete && <span className="risk-forecast-tag watch">PARTIAL MODEL</span>}
      </div>

      <div className="risk-forecast-metrics">
        <ForecastMetric
          k="PORTFOLIO FORECAST VOL"
          v={fmtVolPct(snap.forecastVolPct)}
          title="1-day parametric vol from factor covariance model"
        />
        <ForecastMetric
          k="CURRENT / REALIZED VOL"
          v={fmtVolPct(snap.realizedVolPct)}
          title="Realized vol from recent portfolio return series"
        />
        <ForecastMetric
          k="FORECAST CHANGE"
          v={formatVolChange(snap.forecastChangePct)}
          vClass={changeClass(snap.forecastChangePct)}
          title="Forecast vol vs realized vol"
        />
        <ForecastMetric
          k="EXPECTED BOOK MOVE"
          v={fmtSignedMoney(snap.expectedMove)}
          title="±1σ expected 1-day book move"
        />
        <ForecastMetric
          k="95% 1-DAY VAR"
          v={fmtVar(snap.var95?.valueAtRisk, snap.var95?.equityPct)}
          vClass="neg"
          title="Parametric VaR at 95% confidence, 1-day horizon"
        />
        <ForecastMetric
          k="99% 1-DAY VAR"
          v={fmtVar(snap.var99?.valueAtRisk, snap.var99?.equityPct)}
          vClass="neg"
          title="Parametric VaR at 99% confidence, 1-day horizon"
        />
        <ForecastMetric
          k="STRESS LOSS"
          v={fmtMoneyNeg(snap.stressLoss)}
          vClass="neg"
          title="Worst-case currency shock at active scenario"
        />
        <ForecastMetric
          k="RISK UTILIZATION"
          v={snap.riskUtilization != null ? `${safeNum(snap.riskUtilization, 0)}%` : 'N/A'}
          vClass={utilClass(snap.riskUtilization)}
          title="Current 95% VaR / risk budget (max ccy shock % × equity)"
        />
        <ForecastMetric
          k="LARGEST FACTOR"
          v={snap.largestRiskFactor ?? 'N/A'}
          title="Factor with largest variance contribution"
        />
        <ForecastMetric k="REGIME" v={regime} vClass={regimeClass(regime)} title="Volatility regime" />
      </div>

      <div className="risk-regime-meter">
        <div className="risk-regime-labels">
          {REGIME_STOPS.map((r) => (
            <span key={r} className={r === regime ? 'on' : ''}>
              {r}
            </span>
          ))}
        </div>
        <div className="risk-regime-track">
          <i style={{ left: `${regimePct}%` }} />
        </div>
      </div>
    </section>
  );
}

function ForecastMetric({
  k,
  v,
  vClass,
  title,
}: {
  k: string;
  v: string;
  vClass?: string;
  title?: string;
}) {
  return (
    <div className="risk-forecast-metric" title={title}>
      <span className="ws-metric-k">{k}</span>
      <span className={`ws-metric-v ${vClass ?? ''}`}>{v}</span>
    </div>
  );
}

function fmtVolPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return 'N/A';
  return `${pct.toFixed(2)}%`;
}

function fmtSignedMoney(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `±${formatMoney(v).replace(/^[+-]/, '')}`;
}

function fmtVar(dollars: number | null | undefined, eqPct: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return 'N/A';
  const money = formatMoney(-Math.abs(dollars));
  if (eqPct != null && Number.isFinite(eqPct)) {
    return `${money} (${formatPct(-Math.abs(eqPct))} EQ)`;
  }
  return money;
}

function fmtMoneyNeg(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatMoney(v);
}

function changeClass(v: number | null): string {
  if (v == null) return 'flat';
  if (v > 5) return 'neg';
  if (v < -5) return 'pos';
  return 'flat';
}

function utilClass(v: number | null): string {
  if (v == null) return 'flat';
  if (v > 100) return 'neg';
  if (v > 75) return 'neg';
  return 'flat';
}

function regimeClass(r: RiskRegime): string {
  if (r === 'LOW') return 'pos';
  if (r === 'EXTREME' || r === 'HIGH') return 'neg';
  if (r === 'INSUFFICIENT_DATA') return 'flat';
  return 'flat';
}
