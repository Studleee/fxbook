import { formatCountdown, nextEligible } from '../format';
import { useTerminalStore } from '../store';

export function PairLockouts() {
  const algos = useTerminalStore((s) => s.algos);
  const selected = useTerminalStore((s) => s.selectedPair);
  const clock = useTerminalStore((s) => s.system.clock);
  const selectPair = useTerminalStore((s) => s.selectPair);
  const unlockPair = useTerminalStore((s) => s.unlockPair);
  const lockPair = useTerminalStore((s) => s.lockPair);
  const setPage = useTerminalStore((s) => s.setPage);

  const locked = algos.filter((a) => a.status === 'LOCKED' || a.status === 'COOLDOWN');
  const rest = algos.filter((a) => a.status !== 'LOCKED' && a.status !== 'COOLDOWN');

  return (
    <section className="plock" data-clock={clock}>
      <div className="pane-h">
        <span>PAIR LOCKOUT</span>
        <span>
          {locked.length} ACTIVE · STOP → CLOSE → LOCK → COOLDOWN
        </span>
      </div>
      <div className="plock-body">
        {locked.length === 0 && <div className="ctrl-note">No pairs locked</div>}
        {locked.map((a) => (
          <div key={a.id} className={`plock-card ${selected === a.pair ? 'sel' : ''}`}>
            <button className="plock-main" type="button" onClick={() => selectPair(a.pair)}>
              <div className="plock-pair">{a.pair}</div>
              <div className={`plock-st status-${a.status}`}>{a.status}</div>
              <div className="plock-meta">
                <span>REASON {a.lockReason ?? '—'}</span>
                {a.cooldownEndsAt ? (
                  <span>
                    REMAINING {formatCountdown(a.cooldownEndsAt)} · NEXT {nextEligible(a.cooldownEndsAt)}
                  </span>
                ) : (
                  <span>NO AUTO-EXPIRY (manual)</span>
                )}
                <span>LOSSES {a.consecutiveLosses}</span>
              </div>
            </button>
            <div className="plock-actions">
              <button className="btn" onClick={() => unlockPair(a.pair)}>
                UNLOCK
              </button>
              <button
                className="btn"
                onClick={() => {
                  selectPair(a.pair);
                  setPage('desk');
                }}
              >
                DESK
              </button>
            </div>
          </div>
        ))}
        <div className="plock-idle">
          {rest.map((a) => (
            <button
              key={a.id}
              className={`plock-chip ${selected === a.pair ? 'sel' : ''}`}
              type="button"
              onClick={() => selectPair(a.pair)}
            >
              {a.pair}
              <span>{a.exposureUnits ? 'OPEN' : 'FLAT'}</span>
            </button>
          ))}
        </div>
        <div className="plock-actions">
          <button className="btn btn-lock" onClick={() => lockPair()}>
            LOCK SELECTED
          </button>
          <span className="ctrl-note">Overrides are logged to RISK EVENTS / JOURNAL.</span>
        </div>
      </div>
    </section>
  );
}
