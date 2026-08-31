import { useState } from 'react';

import { formatMoney, formatUnits } from '../../format';

import { safeNum } from '../../analytics/math';

import { buildFactorRiskTableRows } from '../../risk/factor/factorTable';

import { formatFactorVol, formatVolChange } from '../../risk/factor/factorVol';

import type { CurrencyLegAttribution } from '../../risk/portfolio/exposure';

import type { CurrencyCapacityRow } from '../../risk/portfolio/bookMetrics';

import type { FactorRiskTableRow } from '../../risk/factor/factorTable';

import type { RiskWorkbenchResult } from '../../risk/portfolio/types';

import { RiskContributionBars } from './RiskContributionBars';



interface Props {

  workbench: RiskWorkbenchResult;

  maxCurrencyShockRiskPct: number;

  onMaxRiskChange: (value: number) => void;

}



export function CurrencyRiskPanel({ workbench, maxCurrencyShockRiskPct, onMaxRiskChange }: Props) {

  const { currencies, snapshot } = workbench;

  const rows = buildFactorRiskTableRows({ currencies, snapshot });

  const [selected, setSelected] = useState<string | null>(null);

  const row = selected ? currencies.find((c) => c.currency === selected) : null;

  const factorRow = selected ? rows.find((r) => r.currency === selected) : null;



  return (

    <section className="ws-panel">

      <div className="pane-h">

        <span>FACTOR RISK</span>

        <div className="risk-limit-inline">

          <span>MAX CCY SHOCK</span>

          <input

            type="number"

            className="risk-limit-input"

            min={0.1}

            step={0.1}

            value={maxCurrencyShockRiskPct}

            onChange={(e) => onMaxRiskChange(Number.parseFloat(e.target.value) || 1)}

          />

          <span>% EQ</span>

        </div>

      </div>

      <div className="ws-table-wrap">

        <table className="grid ws-grid risk-factor-grid">

          <thead>

            <tr>

              <th>CCY</th>

              <th>NET EXPOSURE</th>

              <th title="Share of gross leg exposure">% PORTFOLIO</th>

              <th title="1H realized factor vol">CURRENT VOL</th>

              <th title="Recent-half vol estimate">FORECAST VOL</th>

              <th title="Forecast vs current vol">VOL CHANGE</th>

              <th title="Component variance % of portfolio risk">RISK CONTRIB</th>

              <th title="Adverse shock utilization vs max">RISK UTIL</th>

              <th>CAPACITY</th>

            </tr>

          </thead>

          <tbody>

            {rows.map((c) => (

              <tr

                key={c.currency}

                className={selected === c.currency ? 'sel' : ''}

                onClick={() => setSelected(c.currency)}

              >

                <td className="sans">{c.currency}</td>

                <td className={netClass(c.netNative)}>{fmtSignedNative(c.netNative, c.currency)}</td>

                <td className="flat">{fmtPortfolioShare(c.grossBookShare)}</td>

                <td className="flat">{formatFactorVol(c.currentVol)}</td>

                <td className="flat">{formatFactorVol(c.forecastVol)}</td>

                <td className={volChangeClass(c.volChangePct)}>{formatVolChange(c.volChangePct)}</td>

                <td className={contribClass(c.riskContributionPct)}>

                  {c.riskContributionPct != null

                    ? `${safeNum(c.riskContributionPct, 1)}%`

                    : 'N/A'}

                </td>

                <td className={utilClass(c.riskUtilizationPct)}>

                  {c.riskUtilizationPct != null ? `${safeNum(c.riskUtilizationPct, 0)}%` : 'N/A'}

                </td>

                <td className={capacityClass(c.remainingCapacityPct)}>

                  {c.remainingCapacityPct != null

                    ? `${safeNum(c.remainingCapacityPct, 0)}%`

                    : 'N/A'}

                </td>

              </tr>

            ))}

            {!rows.length && (

              <tr>

                <td colSpan={9} className="flat">

                  No open exposure

                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>

      <RiskContributionBars
        snapshot={snapshot}
        currencies={currencies}
        selected={selected}
        onSelect={(ccy) => setSelected((cur) => (cur === ccy ? null : ccy))}
      />

      {row && factorRow && (

        <CurrencyExposureDetail row={row} factorRow={factorRow} regime={snapshot?.regime} />

      )}

    </section>

  );

}



function CurrencyExposureDetail({

  row,

  factorRow,

  regime,

}: {

  row: CurrencyCapacityRow;

  factorRow: FactorRiskTableRow;

  regime?: string;

}) {

  const contributions = [...row.attributions].sort(

    (a, b) => Math.abs(b.signedNative) - Math.abs(a.signedNative),

  );



  return (

    <div className="corr-detail-panel shock-detail risk-ccy-detail">

      <div className="corr-detail-h">{row.currency} FACTOR DETAIL</div>



      <DetailRow k="NET EXPOSURE" v={fmtSignedNative(row.netExposure, row.currency)} valueClass={netClass(row.netExposure)} />

      <DetailRow k="% PORTFOLIO" v={fmtPortfolioShare(factorRow.grossBookShare)} />

      <DetailRow k="CURRENT VOL" v={formatFactorVol(factorRow.currentVol)} />

      <DetailRow k="FORECAST VOL" v={formatFactorVol(factorRow.forecastVol)} />

      <DetailRow k="VOL CHANGE" v={formatVolChange(factorRow.volChangePct)} />

      <DetailRow

        k="RISK CONTRIBUTION"

        v={

          factorRow.riskContributionPct != null

            ? `${safeNum(factorRow.riskContributionPct, 1)}%`

            : 'N/A'

        }

      />

      <DetailRow k="REGIME" v={regime ?? 'N/A'} />

      <DetailRow

        k="ADVERSE SHOCK"

        v={fmtMoney(row.adverseShockPnL)}

        valueClass={pnlClass(row.adverseShockPnL)}

      />

      <DetailRow

        k="RISK UTILIZATION"

        v={row.riskUtilizationPct != null ? `${safeNum(row.riskUtilizationPct, 0)}%` : 'N/A'}

      />



      <div className="corr-detail-sub">CONTRIBUTING POSITIONS</div>

      <table className="grid ws-grid shock-detail-grid">

        <thead>

          <tr>

            <th>PAIR</th>

            <th>SIDE</th>

            <th>CONTRIBUTION</th>

          </tr>

        </thead>

        <tbody>

          {contributions.map((a) => (

            <ContributionRow key={`${a.positionId}-${a.leg}`} a={a} currency={row.currency} />

          ))}

        </tbody>

      </table>

    </div>

  );

}



function ContributionRow({

  a,

  currency,

}: {

  a: CurrencyLegAttribution;

  currency: string;

}) {

  return (

    <tr>

      <td className="sans">{a.pair}</td>

      <td>{a.side}</td>

      <td>{fmtSignedNative(a.signedNative, currency)}</td>

    </tr>

  );

}



function DetailRow({

  k,

  v,

  valueClass,

}: {

  k: string;

  v: string;

  valueClass?: string;

}) {

  return (

    <div className="corr-detail-row">

      <span className="corr-detail-k">{k}</span>

      <span className={`corr-detail-v ${valueClass ?? ''}`}>{v}</span>

    </div>

  );

}



function fmtSignedNative(value: number, currency: string): string {

  if (value > 0) return `+${formatUnits(value)} ${currency}`;

  if (value < 0) return `-${formatUnits(Math.abs(value))} ${currency}`;

  return `0 ${currency}`;

}



function fmtPortfolioShare(v: number): string {

  if (!Number.isFinite(v)) return 'N/A';

  return `${safeNum(v, 1)}%`;

}



function fmtMoney(v: number | null): string {

  if (v == null || !Number.isFinite(v)) return 'N/A';

  return formatMoney(v);

}



function netClass(v: number): string {

  if (v > 0) return 'pos';

  if (v < 0) return 'neg';

  return 'flat';

}



function pnlClass(v: number | null): string {

  if (v == null) return 'flat';

  if (v > 0) return 'pos';

  if (v < 0) return 'neg';

  return 'flat';

}



function utilClass(v: number | null): string {

  if (v == null) return 'flat';

  if (v > 100) return 'neg';

  if (v > 75) return 'neg';

  return 'flat';

}



function capacityClass(v: number | null): string {

  if (v == null) return 'flat';

  if (v < 0) return 'neg';

  return 'flat';

}



function volChangeClass(v: number | null): string {

  if (v == null) return 'flat';

  if (v > 10) return 'neg';

  if (v < -10) return 'pos';

  return 'flat';

}



function contribClass(v: number | null): string {

  if (v == null) return 'flat';

  if (Math.abs(v) >= 25) return 'neg';

  if (Math.abs(v) >= 15) return 'neg';

  return 'flat';

}


