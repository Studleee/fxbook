import { useMemo, useRef, useState } from 'react';
import { formatTime } from '../../format';
import { useTerminalStore } from '../../store';

export function EquityHistoryPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const meta = useTerminalStore((s) => s.equityHistoryMeta);
  const snapshots = useTerminalStore((s) => s.equitySnapshots);
  const dataSource = useTerminalStore((s) => s.dataSource);
  const importEquityCsv = useTerminalStore((s) => s.importEquityCsv);
  const syncEquityFromOanda = useTerminalStore((s) => s.syncEquityFromOanda);
  const setEquitySyncDays = useTerminalStore((s) => s.setEquitySyncDays);

  async function onCsvFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      importEquityCsv(text, file.name);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onSync() {
    setBusy(true);
    try {
      await syncEquityFromOanda();
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.timestamp - b.timestamp),
    [snapshots],
  );
  const range =
    sorted.length >= 2
      ? `${formatTime(sorted[0].timestamp)} → ${formatTime(sorted[sorted.length - 1].timestamp)}`
      : '—';

  return (
    <section className="ws-panel eq-history-panel">
      <div className="pane-h">
        <span>EQUITY HISTORY</span>
        <span>{snapshots.length ? `${snapshots.length} PTS` : 'NO DATA'}</span>
      </div>
      <div className="eq-history-toolbar">
        <label className="eq-history-field">
          <span className="eq-history-label">OANDA RANGE</span>
          <select
            value={meta.oandaSyncDays}
            disabled={busy}
            onChange={(e) => setEquitySyncDays(Number(e.target.value))}
          >
            <option value={7}>7 DAYS</option>
            <option value={14}>14 DAYS</option>
            <option value={30}>30 DAYS</option>
            <option value={90}>90 DAYS</option>
          </select>
        </label>
        <button
          type="button"
          className="btn sm"
          disabled={busy || dataSource !== 'oanda'}
          onClick={() => void onSync()}
          title={dataSource !== 'oanda' ? 'Connect OANDA to sync automatically' : undefined}
        >
          {busy ? 'SYNCING…' : 'SYNC OANDA'}
        </button>
        <label className="btn sm eq-file-btn">
          {busy ? 'IMPORTING…' : 'IMPORT CSV'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div className="eq-history-meta">
        <span>SOURCE: {meta.source.toUpperCase()}</span>
        <span>SPAN: {range}</span>
        {meta.lastOandaSyncAt ? (
          <span>OANDA SYNC: {formatTime(meta.lastOandaSyncAt)}</span>
        ) : null}
        {meta.lastCsvImportAt ? (
          <span>
            CSV: {meta.lastCsvFileName ?? 'import'} @ {formatTime(meta.lastCsvImportAt)}
          </span>
        ) : null}
      </div>
      {meta.message ? <div className="ws-note">{meta.message}</div> : null}
      <div className="ws-note">
        OANDA sync runs on connect and rebuilds balance from transaction history (post-txn balance,
        not intraday NAV). Upload OANDA HUB transaction CSV for longer history or offline use.
      </div>
    </section>
  );
}
