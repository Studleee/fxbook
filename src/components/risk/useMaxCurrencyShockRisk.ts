import { useCallback, useState } from 'react';
import {
  DEFAULT_MAX_CURRENCY_SHOCK_RISK_PCT,
  MAX_CURRENCY_SHOCK_RISK_STORAGE_KEY,
} from '../../risk/portfolio/decisionConfig';

function readStored(): number {
  try {
    const raw = localStorage.getItem(MAX_CURRENCY_SHOCK_RISK_STORAGE_KEY);
    if (raw == null) return DEFAULT_MAX_CURRENCY_SHOCK_RISK_PCT;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CURRENCY_SHOCK_RISK_PCT;
  } catch {
    return DEFAULT_MAX_CURRENCY_SHOCK_RISK_PCT;
  }
}

export function useMaxCurrencyShockRiskPct() {
  const [maxCurrencyShockRiskPct, setMax] = useState(readStored);

  const setMaxCurrencyShockRiskPct = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setMax(value);
    try {
      localStorage.setItem(MAX_CURRENCY_SHOCK_RISK_STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, []);

  return { maxCurrencyShockRiskPct, setMaxCurrencyShockRiskPct };
}
