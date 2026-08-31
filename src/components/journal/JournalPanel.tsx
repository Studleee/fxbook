import { useMemo, useState } from 'react';
import { formatMoney, formatTime } from '../../format';
import type { JournalEntry, JournalSource } from '../../analytics/types';
import { useTerminalStore } from '../../store';

export function JournalPanel() {
  const journal = useTerminalStore((s) => s.journal);
  const events = useTerminalStore((s) => s.events);
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<JournalSource | 'ALL'>('ALL');

  const rows = useMemo(() => {
    const fromEvents: JournalEntry[] = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      pair: e.pair,
      event: 'OTHER',
      direction: null,
      units: null,
      price: null,
      pnl: null,
      pips: null,
      source: mapLegacySource(e.source),
      notes: `${e.event} — ${e.reason}`,
    }));
    const merged = [...journal, ...fromEvents].sort((a, b) => b.timestamp - a.timestamp);
    const q = filter.trim().toLowerCase();
    return merged.filter((row) => {
      if (source !== 'ALL' && row.source !== source) return false;
      if (!q) return true;
      return (
        row.pair.toLowerCase().includes(q) ||
        row.event.toLowerCase().includes(q) ||
        row.notes.toLowerCase().includes(q) ||
        row.source.toLowerCase().includes(q)
      );
    });
  }, [journal, events, filter, source]);

  return (
    <div className="journal-page">
      <div className="journal-toolbar">
        <input
          className="journal-search"
          placeholder="Search pair, event, notes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={source} onChange={(e) => setSource(e.target.value as JournalSource | 'ALL')}>
          <option value="ALL">ALL SOURCES</option>
          <option value="FX BOOK">FX BOOK</option>
          <option value="TRADING ENGINE">TRADING ENGINE</option>
          <option value="OANDA">OANDA</option>
          <option value="RISK ENGINE">RISK ENGINE</option>
          <option value="SYSTEM">SYSTEM</option>
        </select>
      </div>
      <div className="ws-table-wrap journal-table">
        <table className="grid ws-grid">
          <thead>
            <tr>
              <th>TIME</th>
              <th>PAIR</th>
              <th>EVENT</th>
              <th>DIR</th>
              <th>UNITS</th>
              <th>PRICE</th>
              <th>P&L</th>
              <th>PIPS</th>
              <th>SOURCE</th>
              <th>NOTES</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatTime(r.timestamp)}</td>
                <td className="sans">{r.pair}</td>
                <td>{r.event}</td>
                <td>{r.direction ?? '—'}</td>
                <td>{r.units ?? '—'}</td>
                <td>{r.price ?? '—'}</td>
                <td>{r.pnl != null ? formatMoney(r.pnl) : '—'}</td>
                <td>{r.pips != null ? r.pips.toFixed(1) : '—'}</td>
                <td className="log-src">{r.source}</td>
                <td className="sans">{r.notes}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} className="flat">
                  No journal entries
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function mapLegacySource(source: string): JournalSource {
  if (source === 'USER') return 'FX BOOK';
  if (source === 'ALGO') return 'TRADING ENGINE';
  if (source === 'BROKER') return 'OANDA';
  if (source === 'RISK ENGINE') return 'RISK ENGINE';
  return 'SYSTEM';
}
