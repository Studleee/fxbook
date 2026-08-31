import { writeOverridesFor } from './config';
import { isKnownPair, toSlashPair } from './pairs';
import { isPairSetting, type PairSetting } from './settings';
import type { SheetWriteResult } from './types';

export async function setPairValue(
  pair: string,
  setting: PairSetting,
  value: string | number | boolean,
): Promise<SheetWriteResult> {
  if (!isKnownPair(pair)) {
    return { ok: false, code: 'unknown_pair', error: `Unknown pair ${pair}` };
  }
  if (!isPairSetting(setting)) {
    return { ok: false, code: 'unknown_setting', error: `Unknown setting ${setting}` };
  }

  try {
    const res = await fetch('/api/sheets/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pair: toSlashPair(pair),
        setting,
        value,
        ...writeOverridesFor(pair),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as SheetWriteResult | { error?: string };
    if (!res.ok || !('ok' in body)) {
      return {
        ok: false,
        code: res.status === 401 || res.status === 403 ? 'auth' : 'write_failed',
        error: 'error' in body && body.error ? body.error : `Sheets write failed (${res.status})`,
      };
    }
    return body;
  } catch {
    return { ok: false, code: 'network', error: 'Network error — sheets API unreachable' };
  }
}
