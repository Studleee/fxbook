import { AlgoBook } from '../components/AlgoBook';
import { AlgoControl } from '../components/AlgoControl';
import { BottomPanel } from '../components/BottomPanel';
import { MarketWorkspace } from '../components/MarketWorkspace';

export function Desk() {
  return (
    <div className="desk">
      <div className="desk-main">
        <AlgoBook />
        <MarketWorkspace />
        <aside className="desk-right">
          <AlgoControl />
        </aside>
      </div>
      <BottomPanel />
    </div>
  );
}
