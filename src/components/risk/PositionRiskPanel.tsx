import { formatMoney, formatUnits } from '../../format';
import { safeNum } from '../../analytics/math';
import type { PositionFactorRisk, RiskSnapshot } from '../../risk/factor/types';
import { useTerminalStore } from '../../store';

interface Props {
  snapshot: RiskSnapshot | null;
  onAnalyze?: (positionId: string) => void;
}

export function PositionRiskPanel({ snapshot, onAnalyze }: Props) {
  const selectPosition = useTerminalStore((s) => s.selectPosition);
  const rows = snapshot?.positionRisk ?? [];

  const handleRow = (id: string) => {
    selectPosition(id);
    onAnalyze?.(id);
  };

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>POSITION RISK</span>
        {snapshot && !snapshot.dataComplete && (
          <span className="risk-forecast-tag watch">PARTIAL</span>
        )}
      </div>
      <div className="ws-table-wrap">
        <table className="grid ws-grid">
          <thead>
            <tr>
              <th>PAIR</th>
              <th>SIDE</th>
              <th>UNITS</th>
              <th>P&amp;L</th>
              <th>EXPOSURE</th>
              <th title="Estimated % of book risk from position leg weights">RISK CONTRIB</th>
              <th title="Expected 1σ move allocated to position">EXPECTED MOVE</th>
              <th title="95% VaR share">LOSS @ 95% VAR</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PositionRow key={r.positionId} row={r} onClick={() => handleRow(r.positionId)} />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="flat">
                  No open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PositionRow({ row, onClick }: { row: PositionFactorRisk; onClick: () => void }) {
  const status = riskStatus(row.riskContributionPct);
  const action = riskAction(status);
  const isHigh = status === 'HIGH';

  return (
    <tr className={isHigh ? 'risk-pos-high' : ''} onClick={onClick}>
      <td className="sans">{row.pair.replace('/', '')}</td>
      <td>{row.side}</td>
      <td>{formatUnits(row.units)}</td>
      <td className={pnlClass(row.unrealizedPnL)}>{formatMoney(row.unrealizedPnL)}</td>
      <td className="flat">
        {row.accountExposure != null ? formatMoney(row.accountExposure) : 'N/A'}
      </td>
      <td className={isHigh ? 'neg' : 'flat'}>
        {row.riskContributionPct != null
          ? `${safeNum(row.riskContributionPct, 1)}%`
          : 'N/A'}
      </td>
      <td className="flat">
        {row.expectedMove != null ? `±${formatMoney(row.expectedMove).replace(/^[+-]/, '')}` : 'N/A'}
      </td>
      <td className="neg">
        {row.var95 != null ? formatMoney(-Math.abs(row.var95)) : 'N/A'}
      </td>
      <td className={statusClass(status)}>{status}</td>
      <td className={action === 'REDUCE' ? 'neg' : 'flat'}>{action}</td>
    </tr>
  );
}

function riskStatus(contribPct: number | null): 'HIGH' | 'NORMAL' | 'LOW' {
  if (contribPct == null) return 'LOW';
  if (contribPct >= 15) return 'HIGH';
  if (contribPct >= 5) return 'NORMAL';
  return 'LOW';
}

function riskAction(status: 'HIGH' | 'NORMAL' | 'LOW'): string {
  if (status === 'HIGH') return 'REDUCE';
  return 'HOLD';
}

function statusClass(status: string): string {
  if (status === 'HIGH') return 'neg';
  if (status === 'NORMAL') return 'flat';
  return 'flat';
}

function pnlClass(v: number): string {
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'flat';
}
