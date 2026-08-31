import { useMemo, useState } from 'react';
import { formatMoney, formatPct, formatSignedPips } from '../../format';
import {
  formatShockScenario,
  isShockAffectedImpact,
  SHOCK_LEVELS,
} from '../../risk/portfolio';
import type { EnrichedCurrencyShock } from '../../risk/portfolio/bookMetrics';
import type { ShockContributionRow } from '../../risk/portfolio/shockContributions';
import type { RiskWorkbenchResult } from '../../risk/portfolio/types';

interface Props {
  workbench: RiskWorkbenchResult;
  shockPercent: number;
  onShockPercentChange: (pct: number) => void;
}

export function CurrencyShockPanel({ workbench, shockPercent, onShockPercentChange }: Props) {
  const [selectedCcy, setSelectedCcy] = useState<string | null>(null);
  const [showUnaffected, setShowUnaffected] = useState(false);

  const rows = workbench.shocks;
  const detail = selectedCcy ? rows.find((r) => r.currency === selectedCcy) : null;
  const headline = workbench.worstShock;

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>CURRENCY SHOCK RISK</span>
        <div className="ws-tabs">
          {SHOCK_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={shockPercent === lvl ? 'on' : ''}
              onClick={() => {
                onShockPercentChange(lvl);
                setSelectedCcy(null);
              }}
            >
              {(lvl * 100).toFixed(2).replace(/\.?0+$/, '')}%
            </button>
          ))}
        </div>
      </div>

      {headline && (
        <div className="ws-metrics risk-shock-headline">
          <Metric k="WORST CURRENCY SHOCK" v={headline.scenarioLabel} />
          <Metric k="BOOK IMPACT" v={fmt(headline.bookImpact)} pnl />
          <Metric
            k="EQUITY IMPACT"
            v={headline.equityImpact != null ? formatPct(headline.equityImpact) : 'N/A'}
            pnl
          />
        </div>
      )}

      <div className="ws-table-wrap">
        <table className="grid ws-grid">
          <thead>
            <tr>
              <th>CCY</th>
              <th>STRENGTHENS</th>
              <th>WEAKENS</th>
              <th>WORST</th>
              <th>WORST % EQ</th>
              <th>AFFECTED POS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.currency}
                className={selectedCcy === r.currency ? 'sel' : ''}
                onClick={() => setSelectedCcy(r.currency)}
              >
                <td>{r.currency}</td>
                <td className="flat">{fmt(r.upShockPnL)}</td>
                <td className="flat">{fmt(r.downShockPnL)}</td>
                <td className={pnlClass(r.worstCasePnL)}>{fmt(r.worstCasePnL)}</td>
                <td className={pnlClass(r.worstCasePercentEquity)}>
                  {r.worstCasePercentEquity != null
                    ? formatPct(r.worstCasePercentEquity)
                    : 'N/A'}
                </td>
                <td>{r.affectedPositionCount}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="flat">
                  N/A — no open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <ShockScenarioDetail
          detail={detail}
          showUnaffected={showUnaffected}
          onToggleUnaffected={() => setShowUnaffected((v) => !v)}
        />
      )}
    </section>
  );
}

function ShockScenarioDetail({
  detail,
  showUnaffected,
  onToggleUnaffected,
}: {
  detail: EnrichedCurrencyShock;
  showUnaffected: boolean;
  onToggleUnaffected: () => void;
}) {
  const scenario = formatShockScenario({
    currency: detail.currency,
    direction: detail.worstDirection,
    shockPercent: detail.shockPercent,
  });

  const { decomposition } = detail;

  const impacts = useMemo(() => {
    const base = showUnaffected
      ? detail.contributions
      : detail.contributions.filter((imp) => isShockAffectedImpact(imp, detail.currency));
    return [...base];
  }, [detail, showUnaffected]);

  return (
    <div className="corr-detail-panel shock-detail">
      <div className="shock-detail-toolbar">
        <div className="corr-detail-h">SCENARIO</div>
        <button
          type="button"
          className={`shock-audit-toggle ${showUnaffected ? 'on' : ''}`}
          onClick={onToggleUnaffected}
        >
          SHOW UNAFFECTED
        </button>
      </div>
      <div className="corr-detail-pair">{scenario}</div>

      <div className="shock-decomp-row">
        <DecompItem k="GROSS LOSS" v={fmt(decomposition.grossAdverseLoss)} pnl />
        <DecompItem k="HEDGE OFFSET" v={fmt(decomposition.hedgeOffset)} pnl />
        <DecompItem k="NET IMPACT" v={fmt(decomposition.netImpact)} pnl />
      </div>

      <table className="grid ws-grid shock-detail-grid">
        <thead>
          <tr>
            <th>PAIR</th>
            <th>SIDE</th>
            <th>UNITS</th>
            <th>PRICE MOVE</th>
            <th>P&L IMPACT</th>
            <th>% OF GROSS</th>
          </tr>
        </thead>
        <tbody>
          {impacts.map((imp) => (
            <ShockContributionRow key={`${imp.pair}-${imp.direction}`} imp={imp} />
          ))}
          {!impacts.length && (
            <tr>
              <td colSpan={6} className="flat">
                No affected positions
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="corr-detail-row">
        <span className="corr-detail-k">TOTAL</span>
        <span className={`corr-detail-v large ${pnlClass(detail.worstCasePnL)}`}>
          {fmt(detail.worstCasePnL)}
        </span>
      </div>
      <div className="corr-detail-row">
        <span className="corr-detail-k">EQUITY IMPACT</span>
        <span className={`corr-detail-v ${pnlClass(detail.worstCasePercentEquity)}`}>
          {detail.worstCasePercentEquity != null
            ? formatPct(detail.worstCasePercentEquity)
            : 'N/A'}
        </span>
      </div>
    </div>
  );
}

function ShockContributionRow({ imp }: { imp: ShockContributionRow }) {
  const pips =
    imp.priceChangePips != null ? `${formatSignedPips(imp.priceChangePips)} pips` : 'N/A';
  const pct =
    imp.pctOfGrossAdverse != null ? `${imp.pctOfGrossAdverse.toFixed(0)}%` : '—';
  return (
    <tr>
      <td className="sans">{imp.pair}</td>
      <td>{imp.direction}</td>
      <td>{imp.units}</td>
      <td className="flat">{pips}</td>
      <td className={pnlClass(imp.pnlImpact)}>{fmt(imp.pnlImpact)}</td>
      <td className={pnlClass(imp.pnlImpact)}>{pct}</td>
    </tr>
  );
}

function DecompItem({ k, v, pnl }: { k: string; v: string; pnl?: boolean }) {
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ''));
  const cls = pnl && Number.isFinite(n) && n < 0 ? 'neg' : pnl && Number.isFinite(n) && n > 0 ? 'pos' : '';
  return (
    <div className="shock-decomp-item">
      <span className="corr-detail-k">{k}</span>
      <span className={`corr-detail-v ${cls}`}>{v}</span>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatMoney(v);
}

function pnlClass(v: number | null): string {
  if (v == null) return 'flat';
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'flat';
}

function Metric({ k, v, pnl }: { k: string; v: string; pnl?: boolean }) {
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ''));
  const cls = pnl && Number.isFinite(n) && n < 0 ? 'neg' : pnl && Number.isFinite(n) && n > 0 ? 'pos' : '';
  return (
    <div className="ws-metric">
      <span className="ws-metric-k">{k}</span>
      <span className={`ws-metric-v ${cls}`}>{v}</span>
    </div>
  );
}
