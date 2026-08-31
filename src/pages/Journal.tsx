import { JournalPanel } from '../components/journal/JournalPanel';

export function Journal() {
  return (
    <div className="ws-page journal-page-wrap">
      <div className="pane-h ws-page-h">
        <span>JOURNAL</span>
        <span>EVENT & TRADE LOG</span>
      </div>
      <JournalPanel />
    </div>
  );
}
