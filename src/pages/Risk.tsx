import { BookSummaryBar } from '../components/risk/BookSummaryBar';
import { BookRiskForecastPanel } from '../components/risk/BookRiskForecastPanel';
import { CurrencyRiskPanel } from '../components/risk/CurrencyRiskPanel';
import { PositionRiskPanel } from '../components/risk/PositionRiskPanel';
import { CorrelationMatrix } from '../components/risk/CorrelationMatrix';
import { useRiskWorkbench } from '../components/risk/useRiskWorkbench';
import { useMaxCurrencyShockRiskPct } from '../components/risk/useMaxCurrencyShockRisk';

export function Risk() {
  const { maxCurrencyShockRiskPct, setMaxCurrencyShockRiskPct } = useMaxCurrencyShockRiskPct();
  const workbench = useRiskWorkbench(undefined, maxCurrencyShockRiskPct);

  return (
    <div className="ws-page risk-page">
      <BookSummaryBar workbench={workbench} />
      <BookRiskForecastPanel workbench={workbench} />
      <CurrencyRiskPanel
        workbench={workbench}
        maxCurrencyShockRiskPct={maxCurrencyShockRiskPct}
        onMaxRiskChange={setMaxCurrencyShockRiskPct}
      />
      <PositionRiskPanel snapshot={workbench.snapshot} />
      <CorrelationMatrix />
    </div>
  );
}
