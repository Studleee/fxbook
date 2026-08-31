import { useMemo } from 'react';
import { calculateRiskWorkbench } from '../../risk/portfolio';
import { DEFAULT_SHOCK_PERCENT } from '../../risk/portfolio/types';
import { useTerminalStore } from '../../store';

export function useRiskWorkbench(
  shockPercent = DEFAULT_SHOCK_PERCENT,
  maxCurrencyShockRiskPct = 1.0,
) {
  const positions = useTerminalStore((s) => s.positions);
  const quotes = useTerminalStore((s) => s.quotes);
  const candles = useTerminalStore((s) => s.candles);
  const equity = useTerminalStore((s) => s.equity);
  const account = useTerminalStore((s) => s.account);

  return useMemo(
    () =>
      calculateRiskWorkbench({
        positions,
        quotes,
        candlesByPair: candles,
        equity,
        balance: account.balance,
        accountCurrency: account.currency,
        shockPercent,
        maxCurrencyShockRiskPct,
      }),
    [
      positions,
      quotes,
      candles,
      equity,
      account.balance,
      account.currency,
      shockPercent,
      maxCurrencyShockRiskPct,
    ],
  );
}
