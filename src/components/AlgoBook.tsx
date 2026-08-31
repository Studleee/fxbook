import { formatMoney, pnlClass } from '../format';
import { useTerminalStore } from '../store';
import { StatusDot } from './Bits';
import type { AlgoStatus } from '../models';

function bookDot(status: AlgoStatus, units: number): AlgoStatus {
  if (status === 'LOCKED' || status === 'COOLDOWN') return status;
  if (units) return 'RUNNING';
  return 'DISABLED';
}

export function AlgoBook() {
  const algos = useTerminalStore((s) => s.algos);
  const positions = useTerminalStore((s) => s.positions);
  const selectedPair = useTerminalStore((s) => s.selectedPair);
  const selectPair = useTerminalStore((s) => s.selectPair);

  return (
    <aside className="book">
      <div className="pane-h">
        <span>PAIRS</span>
        <span className="book-count">{algos.length}</span>
      </div>
      <div className="book-list">
        {algos.map((algo) => {
          const pnl = positions
            .filter((p) => p.pair === algo.pair)
            .reduce((sum, p) => sum + p.unrealizedPnl, 0);
          return (
            <button
              key={algo.id}
              className={`book-row ${selectedPair === algo.pair ? 'sel' : ''}`}
              onClick={() => selectPair(algo.pair)}
            >
              <StatusDot status={bookDot(algo.status, algo.exposureUnits)} />
              <span className="book-pair">{algo.pair}</span>
              <span className={`book-pnl ${pnlClass(pnl)}`}>{formatMoney(pnl)}</span>
            </button>
          );
        })}
        <div className="book-row book-slot" aria-hidden />
      </div>
    </aside>
  );
}
