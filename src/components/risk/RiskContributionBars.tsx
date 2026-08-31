import { useMemo } from 'react';
import { safeNum } from '../../analytics/math';
import {
  affectedPositionsForFactor,
  factorExposureNative,
  formatFactorVol,
} from '../../risk/factor';
import type { RiskSnapshot } from '../../risk/factor/types';
import type { CurrencyCapacityRow } from '../../risk/portfolio/bookMetrics';

interface RiskBar {
  factor: string;
  riskContributionPct: number;
}

interface Props {
  snapshot: RiskSnapshot | null;
  currencies: CurrencyCapacityRow[];
  selected?: string | null;
  onSelect?: (factor: string) => void;
}

export function RiskContributionBars({ snapshot, currencies, selected, onSelect }: Props) {
  const bars = useMemo(() => buildRiskBars(snapshot), [snapshot]);
  const riskUtil = snapshot?.riskUtilization;

  const maxAbs = useMemo(() => {
    if (!bars.length) return 1;
    return Math.max(...bars.map((b) => Math.abs(b.riskContributionPct)), 1);
  }, [bars]);

  if (!bars.length) {
    return (
      <div className="risk-contrib-chart empty">
        <span className="flat">
          {snapshot && !snapshot.dataComplete
            ? 'INSUFFICIENT DATA — risk contributions unavailable'
            : 'No risk contributions to chart'}
        </span>
      </div>
    );
  }

  return (
    <div className="risk-contrib-chart">
      <div className="risk-contrib-head">
        <span className="corr-detail-sub">RISK CONTRIBUTION</span>
        <span className="risk-contrib-util" title="Book risk utilization vs budget">
          RISK UTIL{' '}
          <b>{riskUtil != null ? `${safeNum(riskUtil, 0)}%` : 'N/A'}</b>
        </span>
      </div>

      <div className="risk-contrib-bars" role="img" aria-label="Factor risk contribution">
        {bars.map((bar) => {
          const pct = bar.riskContributionPct;
          const widthPct = (Math.abs(pct) / maxAbs) * 50;
          const isPos = pct >= 0;
          const exposure = snapshot
            ? factorExposureNative(bar.factor, snapshot.factorExposures)
            : 0;
          const factorRisk = snapshot?.factorRisk.find((r) => r.factor === bar.factor);
          const affected = affectedPositionsForFactor(bar.factor, currencies);
          const tooltip = [
            bar.factor,
            `${safeNum(pct, 1)}% OF BOOK RISK`,
            `Exposure: ${exposure >= 0 ? '+' : ''}${safeNum(exposure, 0)} ${bar.factor}`,
            `Forecast Vol: ${formatFactorVol(factorRisk?.forecastVol ?? null)}`,
            `Regime: ${snapshot?.regime ?? 'N/A'}`,
            affected.length ? `Affected: ${affected.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          return (
            <button
              key={bar.factor}
              type="button"
              className={`risk-contrib-row ${selected === bar.factor ? 'sel' : ''}`}
              title={tooltip}
              onClick={() => onSelect?.(bar.factor)}
            >
              <span className="risk-contrib-label">{bar.factor}</span>
              <div className="risk-contrib-track">
                <span className="risk-contrib-zero" aria-hidden />
                <span
                  className={`risk-contrib-fill ${isPos ? 'pos' : 'neg'}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className={`risk-contrib-pct ${isPos ? 'pos' : 'neg'}`}>
                {pct >= 0 ? '+' : ''}
                {safeNum(pct, 1)}%
              </span>
            </button>
          );
        })}
      </div>

      <div className="risk-contrib-axis">
        <span>− RISK</span>
        <span>0</span>
        <span>+ RISK</span>
      </div>
    </div>
  );
}

function buildRiskBars(snapshot: RiskSnapshot | null): RiskBar[] {
  if (!snapshot?.dataComplete) return [];

  const bars = snapshot.factorRisk
    .filter((r) => r.riskContributionPct != null && Math.abs(r.riskContributionPct!) > 0.05)
    .map((r) => ({
      factor: r.factor,
      riskContributionPct: r.riskContributionPct!,
    }));

  const explained = bars.reduce((s, r) => s + r.riskContributionPct, 0);
  const residual = 100 - explained;
  if (Math.abs(residual) > 0.5) {
    bars.push({ factor: 'RESIDUAL', riskContributionPct: residual });
  }

  return bars.sort(
    (a, b) => Math.abs(b.riskContributionPct) - Math.abs(a.riskContributionPct),
  );
}
