import { useEffect, useState } from 'react';
import { setPairValue } from '../sheets/client';
import type { PairSetting } from '../sheets/settings';
import {
  LOCKOUT_HOURS_MAX,
  LOCKOUT_HOURS_MIN,
  SHEET_PIPS_MAX,
  SHEET_PIPS_MIN,
} from '../sheets/settings';
import { useTerminalStore } from '../store';
import { SheetControlSettings } from './SheetControlSettings';

export function SheetLockout({ pair }: { pair: string }) {
  const [hours, setHours] = useState('6');
  const [takeProfit, setTakeProfit] = useState('30');
  const [stopLoss, setStopLoss] = useState('30');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sheetLockout = useTerminalStore((s) => s.sheetLockout);

  useEffect(() => {
    setNote(null);
  }, [pair]);

  async function writeLockout(next: number) {
    if (!Number.isFinite(next) || next < LOCKOUT_HOURS_MIN || next > LOCKOUT_HOURS_MAX) {
      setNote({
        ok: false,
        text: `Hours must be ${LOCKOUT_HOURS_MIN}–${LOCKOUT_HOURS_MAX}`,
      });
      return;
    }
    setBusy('lockout');
    setNote(null);
    const result = await sheetLockout(next);
    setBusy(null);
    if (!result.ok) {
      setNote({ ok: false, text: result.error });
      return;
    }
    setNote({
      ok: true,
      text:
        next === 0
          ? `${pair} unlock written (0 hours).`
          : `${pair} locked out for ${next} hour${next === 1 ? '' : 's'}.`,
    });
  }

  async function writePips(setting: PairSetting, raw: string, label: string) {
    const next = Math.round(Number(raw));
    if (!Number.isFinite(next) || next < SHEET_PIPS_MIN || next > SHEET_PIPS_MAX) {
      setNote({
        ok: false,
        text: `${label} must be ${SHEET_PIPS_MIN}–${SHEET_PIPS_MAX}`,
      });
      return;
    }
    setBusy(setting);
    setNote(null);
    const result = await setPairValue(pair, setting, next);
    setBusy(null);
    if (!result.ok) {
      setNote({ ok: false, text: result.error });
      return;
    }
    setNote({
      ok: true,
      text: `${pair} ${label.toLowerCase()} ${next} pips written.`,
    });
  }

  const parsed = Number(hours);
  const writing = busy != null;

  return (
    <div className="sheet-lock">
      <div className="pane-h sheet-lock-h">
        <span>SHEETS CONTROL</span>
        <SheetControlSettings pair={pair} />
      </div>
      <div className="sheet-lock-row">
        <input
          className="sheet-lock-in"
          type="number"
          min={LOCKOUT_HOURS_MIN}
          max={LOCKOUT_HOURS_MAX}
          step={1}
          value={hours}
          disabled={writing}
          onChange={(e) => setHours(e.target.value)}
        />
        <span className="sheet-lock-unit">Hours</span>
        <button
          className="btn btn-lock"
          disabled={writing}
          onClick={() => void writeLockout(Math.round(parsed))}
        >
          {busy === 'lockout' ? 'WRITING…' : 'LOCKOUT'}
        </button>
      </div>
      <div className="sheet-lock-row">
        <input
          className="sheet-lock-in"
          type="number"
          min={SHEET_PIPS_MIN}
          max={SHEET_PIPS_MAX}
          step={1}
          value={takeProfit}
          disabled={writing}
          aria-label="Take profit pips"
          onChange={(e) => setTakeProfit(e.target.value)}
        />
        <span className="sheet-lock-unit">Pips</span>
        <button
          className="btn"
          disabled={writing}
          onClick={() => void writePips('takeProfitPips', takeProfit, 'Take profit')}
        >
          {busy === 'takeProfitPips' ? 'WRITING…' : 'TAKE PROFIT'}
        </button>
      </div>
      <div className="sheet-lock-row">
        <input
          className="sheet-lock-in"
          type="number"
          min={SHEET_PIPS_MIN}
          max={SHEET_PIPS_MAX}
          step={1}
          value={stopLoss}
          disabled={writing}
          aria-label="Stop loss pips"
          onChange={(e) => setStopLoss(e.target.value)}
        />
        <span className="sheet-lock-unit">Pips</span>
        <button
          className="btn"
          disabled={writing}
          onClick={() => void writePips('stopLossPips', stopLoss, 'Stop loss')}
        >
          {busy === 'stopLossPips' ? 'WRITING…' : 'STOP LOSS'}
        </button>
      </div>
      {note ? (
        <div className={`sheet-lock-msg ${note.ok ? 'ok' : 'bad'}`}>{note.text}</div>
      ) : null}
    </div>
  );
}
