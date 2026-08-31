import { EquityCurveChart } from '../components/analytics/EquityCurveChart';
import { EquityHistoryPanel } from '../components/analytics/EquityHistoryPanel';
import { AnalyticsOverview } from '../components/analytics/AnalyticsOverview';
import { LongShortSplit } from '../components/analytics/LongShortSplit';
import { PairAnalyticsDetail } from '../components/analytics/PairAnalyticsDetail';
import { PairLeaderboard } from '../components/analytics/PairLeaderboard';

export function Analytics() {
  return (
    <div className="ws-page analytics-page">
      <AnalyticsOverview />
      <EquityHistoryPanel />
      <EquityCurveChart />
      <div className="ws-analytics-grid">
        <PairLeaderboard />
        <div className="ws-analytics-side">
          <LongShortSplit />
          <PairAnalyticsDetail />
        </div>
      </div>
    </div>
  );
}
