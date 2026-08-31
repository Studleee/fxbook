import { useEffect } from 'react';
import type { PageId } from '../models';
import { riskSnapshot } from '../risk/engine';
import { useTerminalStore } from '../store';
import { AppearanceMenu } from './AppearanceMenu';
import { StatusLed } from './Bits';

const NAV: { id: PageId; label: string }[] = [
  { id: 'desk', label: 'DESK' },
  { id: 'risk', label: 'RISK' },
  { id: 'analytics', label: 'ANALYTICS' },
  { id: 'journal', label: 'JOURNAL' },
  { id: 'settings', label: 'SETTINGS' },
];

export function TerminalHeader() {
  const system = useTerminalStore((s) => s.system);
  const page = useTerminalStore((s) => s.page);
  const setPage = useTerminalStore((s) => s.setPage);
  const dataSource = useTerminalStore((s) => s.dataSource);
  const sheetsConnected = useTerminalStore((s) => s.sheetsConnected);
  const risk = useTerminalStore((s) => s.risk);
  const dayPnl = useTerminalStore((s) => s.dayPnl);
  const equity = useTerminalStore((s) => s.equity);
  const drawdownPct = useTerminalStore((s) => s.drawdownPct);
  const marginUsedPct = useTerminalStore((s) => s.account.marginUsedPct);
  const openCount = useTerminalStore((s) => s.openCount);
  const positions = useTerminalStore((s) => s.positions);
  const env = system.environment;
  const oandaOn = dataSource === 'oanda';
  const refreshSheetsStatus = useTerminalStore((s) => s.refreshSheetsStatus);

  useEffect(() => {
    void refreshSheetsStatus();
  }, [refreshSheetsStatus]);

  const snap = riskSnapshot({
    policy: risk,
    dayPnl,
    equity,
    drawdownPct,
    marginUsedPct,
    openCount,
    positions,
  });

  return (
    <header className="hdr">
      <div className="hdr-brand">
        <img className="hdr-logo" src="/fxbook-logo.png?v=2" alt="FX Book" />
      </div>
      <nav className="hdr-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? 'active' : ''}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="hdr-status">
        <button
          className={`risk-chip rgov-${
            snap.status === 'SAFE'
              ? 'safe'
              : snap.status === 'CAUTION'
                ? 'warn'
                : snap.status === 'LIMIT APPROACHING'
                  ? 'hot'
                  : 'lock'
          }`}
          onClick={() => setPage('risk')}
          title={snap.status}
        >
          RISK {Math.round(risk.aggressionPct)}%
        </button>
        <span className={`env env-${env}`}>{env}</span>
        <button className="hdr-feed" type="button" onClick={() => setPage('settings')}>
          <StatusLed status={oandaOn ? 'connected' : 'disconnected'} />
          OANDA
        </button>
        <button className="hdr-feed" type="button" onClick={() => setPage('settings')}>
          <StatusLed status={sheetsConnected ? 'connected' : 'disconnected'} />
          SHEETS
        </button>
        <AppearanceMenu />
      </div>
    </header>
  );
}
