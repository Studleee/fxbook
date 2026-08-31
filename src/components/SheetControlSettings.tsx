import { useEffect, useRef, useState } from 'react';
import {
  fetchBindings,
  isA1Cell,
  loadPairSheetConfig,
  parseSpreadsheetId,
  saveBindings,
  savePairSheetConfig,
  SHEET_CONTROL_BUTTONS,
  type PairSheetConfig,
} from '../sheets/config';
import type { PairSetting } from '../sheets/settings';

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <path
        fill="currentColor"
        d="M6.4 1.2h3.2l.3 1.5a4.8 4.8 0 0 1 1.2.7l1.5-.5 1.6 2.8-1.2 1c.1.4.1.8.1 1.2s0 .8-.1 1.2l1.2 1-1.6 2.8-1.5-.5a4.8 4.8 0 0 1-1.2.7l-.3 1.5H6.4l-.3-1.5a4.8 4.8 0 0 1-1.2-.7l-1.5.5L1.8 10l1.2-1a5 5 0 0 1 0-2.4L1.8 5.6l1.6-2.8 1.5.5a4.8 4.8 0 0 1 1.2-.7l.3-1.4ZM8 6.2A1.8 1.8 0 1 0 8 9.8 1.8 1.8 0 0 0 8 6.2Z"
      />
    </svg>
  );
}

export function SheetControlSettings({ pair }: { pair: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PairSheetConfig>(() => loadPairSheetConfig(pair));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const local = loadPairSheetConfig(pair);
    setDraft(local);
    setNote(null);
    if (!open) return;
    void fetchBindings()
      .then((cells) => {
        if (Object.keys(cells).length) setDraft((d) => ({ ...d, cells: { ...d.cells, ...cells } }));
      })
      .catch(() => {
        setNote({ ok: false, text: 'Sheets backend unreachable — bindings not loaded' });
      });
  }, [pair, open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function save() {
    if (draft.spreadsheetUrl.trim() && !parseSpreadsheetId(draft.spreadsheetUrl)) {
      setNote({ ok: false, text: 'Could not read a spreadsheet ID from that link' });
      return;
    }
    const cells: Partial<Record<PairSetting, string>> = {};
    for (const btn of SHEET_CONTROL_BUTTONS) {
      const cell = (draft.cells[btn.setting] ?? '').trim();
      if (cell && !isA1Cell(cell)) {
        setNote({ ok: false, text: `${btn.label} cell must be A1, e.g. D3` });
        return;
      }
      if (cell) cells[btn.setting] = cell.toUpperCase();
    }
    const saved = savePairSheetConfig(pair, { ...draft, cells });
    setDraft(saved);
    try {
      const universal = await saveBindings(cells);
      setDraft((d) => ({ ...d, cells: { ...d.cells, ...universal } }));
      setNote({ ok: true, text: `${pair} spreadsheet saved · bindings apply to all pairs` });
    } catch (err) {
      setNote({
        ok: false,
        text: err instanceof Error ? err.message : 'Pair link saved — bindings not written',
      });
    }
  }

  return (
    <div className="sheet-gear-wrap" ref={root}>
      <button
        type="button"
        className={`sheet-gear ${open ? 'on' : ''}`}
        aria-label="Sheets settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon />
      </button>
      {open ? (
        <div className="sheet-cfg">
          <label className="sheet-cfg-lbl">
            SPREADSHEET LINK
            <input
              className="sheet-cfg-in"
              type="text"
              spellCheck={false}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={draft.spreadsheetUrl}
              onChange={(e) => setDraft({ ...draft, spreadsheetUrl: e.target.value })}
            />
          </label>
          <label className="sheet-cfg-lbl">
            SHEET NAME
            <input
              className="sheet-cfg-in"
              type="text"
              spellCheck={false}
              placeholder="Trade Management"
              value={draft.sheetName}
              onChange={(e) => setDraft({ ...draft, sheetName: e.target.value })}
            />
          </label>
          <div className="sheet-cfg-lbl">BINDINGS · ALL PAIRS</div>
          {SHEET_CONTROL_BUTTONS.map((btn) => (
            <label key={btn.setting} className="sheet-cfg-bind">
              <span>{btn.label}</span>
              <input
                className="sheet-cfg-cell"
                type="text"
                spellCheck={false}
                value={draft.cells[btn.setting] ?? btn.defaultCell}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cells: { ...draft.cells, [btn.setting]: e.target.value.toUpperCase() },
                  })
                }
              />
            </label>
          ))}
          <button type="button" className="btn sheet-cfg-save" onClick={() => void save()}>
            SAVE
          </button>
          {note ? (
            <div className={`sheet-lock-msg ${note.ok ? 'ok' : 'bad'}`}>{note.text}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
