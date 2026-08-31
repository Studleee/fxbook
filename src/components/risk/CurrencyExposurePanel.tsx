import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { formatUnits, pnlClass } from '../../format';
import { calculateCurrencyExposure } from '../../analytics/exposure';
import { useTerminalStore } from '../../store';

export function CurrencyExposurePanel() {
  const positions = useTerminalStore((s) => s.positions);
  const rows = useMemo(() => calculateCurrencyExposure(positions), [positions]);
  const maxGross = Math.max(...rows.map((r) => r.grossPct), 1);

  return (
    <section className="ws-panel">
      <div className="pane-h">
        <span>CURRENCY EXPOSURE</span>
        <span>NORMALIZED UNITS</span>
      </div>
      <div className="ws-table-wrap">
        <table className="grid ws-grid">
          <thead>
            <tr>
              <th>CCY</th>
              <th>NET</th>
              <th>LONG</th>
              <th>SHORT</th>
              <th>GROSS %</th>
              <th>NET %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.currency} className={row.concentrated ? 'ws-hot' : ''}>
                <td className="sans">{row.currency}</td>
                <td className={pnlClass(row.netUnits)}>{formatUnits(row.netUnits)}</td>
                <td>{formatUnits(row.longUnits)}</td>
                <td>{formatUnits(row.shortUnits)}</td>
                <td>
                  <div className="ws-bar-cell">
                    <span
                      className="ws-bar"
                      style={{ '--ws-w': `${(row.grossPct / maxGross) * 100}%` } as CSSProperties}
                    />
                    <b>{row.grossPct.toFixed(0)}%</b>
                  </div>
                </td>
                <td>{row.netPct.toFixed(0)}%</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="sans flat">
                  No open exposure
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
