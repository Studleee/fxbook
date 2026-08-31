import { useMemo, useState } from 'react';
import type { Side } from '../../models';
import { formatMoney, formatPct, formatUnits } from '../../format';
import { safeNum } from '../../analytics/math';
import { DESK_PAIRS } from '../../services/oanda/format';
import {
  currenciesOverCapacity,
  simulateBookChange,
  solveHedgeUnits,
  suggestHedgeForCurrency,
  type BookComparisonResult,
  type HedgeSolveResult,
  type HedgeTargetType,
  type ProposedBookChange,
} from '../../risk/portfolio';
import type { RiskWorkbenchResult } from '../../risk/portfolio/types';
import { useTerminalStore } from '../../store';

type DecisionMode = 'SITUATION' | 'PROPOSE' | 'EXISTING';

interface Props {
  workbench: RiskWorkbenchResult;
  shockPercent: number;
  maxCurrencyShockRiskPct: number;
}

export function BookDecisionPanel({ workbench, shockPercent, maxCurrencyShockRiskPct }: Props) {
  const positions = useTerminalStore((s) => s.positions);
  const quotes = useTerminalStore((s) => s.quotes);
  const equity = useTerminalStore((s) => s.equity);
  const account = useTerminalStore((s) => s.account);
  const candles = useTerminalStore((s) => s.candles);

  const [mode, setMode] = useState<DecisionMode>('SITUATION');
  const [pair, setPair] = useState('USD/CAD');
  const [side, setSide] = useState<Side>('LONG');
  const [units, setUnits] = useState(100);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [existingAction, setExistingAction] = useState<'CLOSE' | 'REDUCE'>('CLOSE');
  const [comparison, setComparison] = useState<BookComparisonResult | null>(null);

  const [hedgeCurrency, setHedgeCurrency] = useState('USD');
  const [hedgePair, setHedgePair] = useState('USD/CAD');
  const [hedgeSide, setHedgeSide] = useState<Side>('SHORT');
  const [hedgeTarget, setHedgeTarget] = useState<HedgeTargetType>('CURRENCY_UTIL');
  const [hedgeResult, setHedgeResult] = useState<HedgeSolveResult | null>(null);

  const selectedPosition = positions.find((p) => p.id === selectedPositionId) ?? positions[0];

  const overCapacity = useMemo(
    () => currenciesOverCapacity(workbench),
    [workbench],
  );

  const pairOptions = useMemo(() => {
    const set = new Set<string>([...DESK_PAIRS, ...positions.map((p) => p.pair)]);
    return [...set].sort();
  }, [positions]);

  const shockLabel = `${(shockPercent * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

  const applySuggestedHedge = () => {
    const row = workbench.currencies.find((c) => c.currency === hedgeCurrency);
    const suggestion = suggestHedgeForCurrency({
      currency: hedgeCurrency,
      netNative: row?.netNative ?? 0,
      pairs: pairOptions,
    });
    if (suggestion) {
      setHedgePair(suggestion.pair);
      setHedgeSide(suggestion.side);
    }
  };

  const runHedgeSolve = () => {
    const result = solveHedgeUnits({
      positions,
      quotes,
      equity,
      accountCurrency: account.currency,
      shockPercent,
      maxCurrencyShockRiskPct,
      hedgePair: hedgePair.replace('_', '/'),
      hedgeSide,
      currency: hedgeTarget === 'CURRENCY_UTIL' ? hedgeCurrency : undefined,
      targetType: hedgeTarget,
      targetUtilizationPct: 100,
    });
    setHedgeResult(result);
    setComparison(null);

    if (result.feasible && result.unitsNeeded > 0) {
      const sim = simulateBookChange({
        positions,
        quotes,
        equity,
        accountCurrency: account.currency,
        shockPercent,
        maxCurrencyShockRiskPct,
        change: {
          type: 'ADD_POSITION',
          pair: hedgePair.replace('_', '/'),
          side: hedgeSide,
          units: result.unitsNeeded,
        },
        candlesByPair: candles,
      });
      setComparison(sim.comparison);
    }
  };

  const runSimulation = () => {
    setHedgeResult(null);
    let change: ProposedBookChange;
    if (mode === 'PROPOSE') {
      change = {
        type: 'ADD_POSITION',
        pair: pair.replace('_', '/'),
        side,
        units,
      };
    } else if (!selectedPosition) {
      setComparison(null);
      return;
    } else if (existingAction === 'CLOSE') {
      change = {
        type: 'CLOSE_POSITION',
        pair: selectedPosition.pair,
        side: selectedPosition.side,
        units: selectedPosition.units,
        positionId: selectedPosition.id,
      };
    } else {
      change = {
        type: 'REDUCE_POSITION',
        pair: selectedPosition.pair,
        side: selectedPosition.side,
        units: Math.min(units, selectedPosition.units),
        positionId: selectedPosition.id,
      };
    }

    const result = simulateBookChange({
      positions,
      quotes,
      equity,
      accountCurrency: account.currency,
      shockPercent,
      maxCurrencyShockRiskPct,
      change,
      candlesByPair: candles,
    });
    setComparison(result.comparison);
  };

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>SITUATION TESTER</span>
        <div className="ws-tabs">
          <button
            type="button"
            className={mode === 'SITUATION' ? 'on' : ''}
            onClick={() => setMode('SITUATION')}
          >
            HEDGE SOLVER
          </button>
          <button
            type="button"
            className={mode === 'PROPOSE' ? 'on' : ''}
            onClick={() => setMode('PROPOSE')}
          >
            PROPOSE TRADE
          </button>
          <button
            type="button"
            className={mode === 'EXISTING' ? 'on' : ''}
            onClick={() => setMode('EXISTING')}
          >
            ANALYZE POSITION
          </button>
        </div>
      </div>

      <div className="risk-scenario-strip">
        <span>SCENARIO {shockLabel} SHOCK</span>
        <span>MAX RISK {maxCurrencyShockRiskPct}% EQ</span>
        {overCapacity.length > 0 && (
          <span className="neg">OVER CAPACITY: {overCapacity.join(', ')}</span>
        )}
      </div>

      <div className="risk-decision-form">
        {mode === 'SITUATION' && (
          <>
            <label>
              TARGET
              <select
                value={hedgeTarget}
                onChange={(e) => setHedgeTarget(e.target.value as HedgeTargetType)}
              >
                <option value="CURRENCY_UTIL">CCY UNDER CAPACITY</option>
                <option value="WORST_SHOCK">WORST SHOCK UNDER MAX</option>
              </select>
            </label>
            {hedgeTarget === 'CURRENCY_UTIL' && (
              <label>
                CURRENCY
                <select value={hedgeCurrency} onChange={(e) => setHedgeCurrency(e.target.value)}>
                  {workbench.currencies.map((c) => (
                    <option key={c.currency} value={c.currency}>
                      {c.currency}
                      {c.riskUtilizationPct != null
                        ? ` (${safeNum(c.riskUtilizationPct, 0)}% util)`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              HEDGE PAIR
              <select value={hedgePair} onChange={(e) => setHedgePair(e.target.value)}>
                {pairOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              HEDGE SIDE
              <select
                value={hedgeSide}
                onChange={(e) => setHedgeSide(e.target.value as Side)}
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </label>
            <button type="button" className="risk-sim-btn subtle" onClick={applySuggestedHedge}>
              SUGGEST
            </button>
            <button type="button" className="risk-sim-btn" onClick={runHedgeSolve}>
              CALCULATE HEDGE
            </button>
          </>
        )}

        {mode === 'PROPOSE' && (
          <>
            <label>
              PAIR
              <input value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} />
            </label>
            <label>
              SIDE
              <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </label>
            <label>
              UNITS
              <input
                type="number"
                min={1}
                value={units}
                onChange={(e) => setUnits(Number.parseInt(e.target.value, 10) || 0)}
              />
            </label>
            <button type="button" className="risk-sim-btn" onClick={runSimulation}>
              SIMULATE
            </button>
          </>
        )}

        {mode === 'EXISTING' && (
          <>
            <label>
              POSITION
              <select
                value={selectedPosition?.id ?? ''}
                onChange={(e) => setSelectedPositionId(e.target.value)}
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pair} {p.side} {formatUnits(p.units)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ACTION
              <select
                value={existingAction}
                onChange={(e) => setExistingAction(e.target.value as 'CLOSE' | 'REDUCE')}
              >
                <option value="CLOSE">ANALYZE CLOSE</option>
                <option value="REDUCE">ANALYZE REDUCE</option>
              </select>
            </label>
            {existingAction === 'REDUCE' && (
              <label>
                REDUCE UNITS
                <input
                  type="number"
                  min={1}
                  max={selectedPosition?.units}
                  value={units}
                  onChange={(e) => setUnits(Number.parseInt(e.target.value, 10) || 0)}
                />
              </label>
            )}
            <button type="button" className="risk-sim-btn" onClick={runSimulation}>
              SIMULATE
            </button>
          </>
        )}
      </div>

      {hedgeResult && mode === 'SITUATION' && (
        <div className="risk-hedge-result">
          {hedgeResult.alreadyAtTarget ? (
            <div className="risk-hedge-headline pos">
              Already under target at {shockLabel} / {maxCurrencyShockRiskPct}% max.
            </div>
          ) : hedgeResult.feasible ? (
            <>
              <div className="risk-hedge-headline">
                HEDGE: {hedgeSide} {formatUnits(hedgeResult.unitsNeeded)} {hedgePair}
              </div>
              <div className="risk-hedge-metrics">
                {hedgeTarget === 'CURRENCY_UTIL' && hedgeResult.currency && (
                  <>
                    <span>
                      {hedgeResult.currency} UTIL{' '}
                      {hedgeResult.before.utilizationPct != null
                        ? `${safeNum(hedgeResult.before.utilizationPct, 0)}%`
                        : 'N/A'}{' '}
                      →{' '}
                      {hedgeResult.after.utilizationPct != null
                        ? `${safeNum(hedgeResult.after.utilizationPct, 0)}%`
                        : 'N/A'}
                    </span>
                    <span>
                      ADVERSE{' '}
                      {hedgeResult.before.adverseEquityPct != null
                        ? formatPct(hedgeResult.before.adverseEquityPct)
                        : 'N/A'}{' '}
                      →{' '}
                      {hedgeResult.after.adverseEquityPct != null
                        ? formatPct(hedgeResult.after.adverseEquityPct)
                        : 'N/A'}
                    </span>
                  </>
                )}
                <span>
                  WORST SHOCK{' '}
                  {hedgeResult.before.worstShockEquityPct != null
                    ? formatPct(hedgeResult.before.worstShockEquityPct)
                    : 'N/A'}{' '}
                  →{' '}
                  {hedgeResult.after.worstShockEquityPct != null
                    ? formatPct(hedgeResult.after.worstShockEquityPct)
                    : 'N/A'}
                </span>
              </div>
            </>
          ) : (
            <div className="risk-hedge-headline neg">
              {hedgeResult.note ?? 'Cannot reach target with this hedge.'}
            </div>
          )}
        </div>
      )}

      {comparison && <ComparisonResults comparison={comparison} />}
    </section>
  );
}

function ComparisonResults({ comparison }: { comparison: BookComparisonResult }) {
  return (
    <div className="risk-decision-results">
      <div className="corr-detail-h">BEFORE / AFTER / CHANGE</div>

      <table className="grid ws-grid shock-detail-grid risk-bac-table">
        <thead>
          <tr>
            <th>METRIC</th>
            <th>BEFORE</th>
            <th>AFTER</th>
            <th>CHANGE</th>
          </tr>
        </thead>
        <tbody>
          <BacRow
            label="Gross Exposure"
            before={fmtMoney(comparison.grossExposure.before)}
            after={fmtMoney(comparison.grossExposure.after)}
            change={fmtMoneyDelta(comparison.grossExposure.change)}
            changeClass={deltaClass(comparison.grossExposure.change)}
          />
          <BacRow
            label="Gross Leverage"
            before={fmtLeverage(comparison.grossLeverage.before)}
            after={fmtLeverage(comparison.grossLeverage.after)}
            change={fmtLeverageDelta(comparison.grossLeverage.change)}
            changeClass={deltaClass(comparison.grossLeverage.change, true)}
          />
          <BacRow
            label="Worst Shock"
            before={fmtPct(comparison.worstShockEquityPct.before)}
            after={fmtPct(comparison.worstShockEquityPct.after)}
            change={fmtPctDelta(comparison.worstShockEquityPct.change)}
            changeClass={worseClass(comparison.worstShockEquityPct.change)}
          />
          {Object.entries(comparison.currencyShockEquityPct)
            .filter(([, t]) => t.before != null || t.after != null)
            .sort((a, b) => Math.abs(b[1].change ?? 0) - Math.abs(a[1].change ?? 0))
            .slice(0, 6)
            .map(([ccy, t]) => (
              <BacRow
                key={ccy}
                label={`${ccy} Shock`}
                before={fmtPct(t.before)}
                after={fmtPct(t.after)}
                change={fmtPctDelta(t.change)}
                changeClass={worseClass(t.change)}
              />
            ))}
        </tbody>
      </table>

      <div className="corr-detail-sub">MARGINAL CURRENCY RISK</div>
      <div className="risk-marginal-list">
        {comparison.marginalCurrencyRisks
          .filter((r) => r.marginalPnL != null && r.marginalPnL !== 0)
          .slice(0, 8)
          .map((r) => (
            <div key={r.currency} className="risk-marginal-row">
              <span>{r.currency} RISK</span>
              <span className={marginalClass(r.marginalPnL)}>
                {r.marginalPnL! < 0 ? '+' : r.marginalPnL! > 0 ? '−' : ''}
                {formatMoney(Math.abs(r.marginalPnL!))}{' '}
                {r.marginalPnL! < 0 ? 'more downside' : 'risk reduction'}
              </span>
            </div>
          ))}
      </div>

      <div className="risk-classification">
        <span>CLASSIFICATION</span>
        <span className={classificationClass(comparison.classification)}>
          {comparison.classification}
        </span>
        {comparison.riskDeltaEquityPct != null && (
          <span className="flat">
            Marginal worst-shock: {comparison.riskDeltaEquityPct >= 0 ? '+' : ''}
            {comparison.riskDeltaEquityPct.toFixed(2)}% equity
          </span>
        )}
      </div>

      {comparison.correlationContext.length > 0 && (
        <>
          <div className="corr-detail-sub">CORRELATION CONTEXT</div>
          {comparison.correlationContext.slice(0, 4).map((ctx) => (
            <div key={ctx.pairB} className="corr-detail-pos">
              <span>
                {ctx.pairA} ↔ {ctx.pairB} · {ctx.window} ·{' '}
                {ctx.correlation != null ? ctx.correlation.toFixed(2) : 'N/A'}
              </span>
              <span className="flat">
                {ctx.existingSide} → {ctx.relationship}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function BacRow({
  label,
  before,
  after,
  change,
  changeClass,
}: {
  label: string;
  before: string;
  after: string;
  change: string;
  changeClass?: string;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td>{before}</td>
      <td>{after}</td>
      <td className={changeClass}>{change}</td>
    </tr>
  );
}

function fmtMoney(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatMoney(v);
}

function fmtMoneyDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatMoney(v);
}

function fmtLeverage(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return `${safeNum(v, 1)}x`;
}

function fmtLeverageDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  const sign = v > 0 ? '+' : '';
  return `${sign}${safeNum(v, 1)}x`;
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatPct(v);
}

function fmtPctDelta(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return formatPct(v);
}

function deltaClass(v: number | null, invert = false): string {
  if (v == null) return 'flat';
  if (invert) {
    if (v > 0) return 'neg';
    if (v < 0) return 'pos';
  }
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'flat';
}

function worseClass(v: number | null): string {
  if (v == null) return 'flat';
  if (v < 0) return 'pos';
  if (v > 0) return 'neg';
  return 'flat';
}

function marginalClass(v: number | null): string {
  if (v == null) return 'flat';
  if (v < 0) return 'neg';
  if (v > 0) return 'pos';
  return 'flat';
}

function classificationClass(c: string): string {
  if (c === 'RISK REDUCING') return 'pos';
  if (c === 'HIGH RISK ADD') return 'neg';
  if (c === 'MODERATE RISK ADD') return 'neg';
  return 'flat';
}
