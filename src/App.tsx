import { useEffect } from 'react';
import { AccountStrip } from './components/AccountStrip';
import { TerminalHeader } from './components/TerminalHeader';
import { Desk } from './pages/Desk';
import { Analytics } from './pages/Analytics';
import { Journal } from './pages/Journal';
import { Risk } from './pages/Risk';
import { Settings } from './pages/Settings';
import { useTerminalStore } from './store';

export default function App() {
  const page = useTerminalStore((s) => s.page);

  useEffect(() => {
    void useTerminalStore.getState().refreshSheetsStatus();
    const clock = window.setInterval(() => useTerminalStore.getState().tickClock(), 1000);
    const market = window.setInterval(() => useTerminalStore.getState().tickMarket(), 800);
    const broker = window.setInterval(() => void useTerminalStore.getState().pollBroker(), 2000);
    const sheets = window.setInterval(() => void useTerminalStore.getState().refreshSheetsStatus(), 10_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(market);
      window.clearInterval(broker);
      window.clearInterval(sheets);
    };
  }, []);

  return (
    <div className="terminal">
      <TerminalHeader />
      <AccountStrip />
      {page === 'desk' ? (
        <Desk />
      ) : page === 'risk' ? (
        <Risk />
      ) : page === 'analytics' ? (
        <Analytics />
      ) : page === 'journal' ? (
        <Journal />
      ) : page === 'settings' ? (
        <Settings />
      ) : null}
    </div>
  );
}
