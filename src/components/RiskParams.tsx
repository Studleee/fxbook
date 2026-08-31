import type { RiskPolicy } from '../models';
import { useTerminalStore } from '../store';

export function RiskParams() {
  const risk = useTerminalStore((s) => s.risk);
  const patchRisk = useTerminalStore((s) => s.patchRisk);

  const set = (next: (p: RiskPolicy) => RiskPolicy) => patchRisk(next);

  return (
    <div className="rparams">
      <fieldset className="rbox">
        <legend>ACCOUNT RISK</legend>
        <Num
          label="MAX DAILY LOSS"
          unit="%"
          value={risk.account.maxDailyLossPct}
          step={0.1}
          onChange={(n) => set((p) => ({ ...p, account: { ...p.account, maxDailyLossPct: n } }))}
        />
        <Num
          label="MAX ACCOUNT DRAWDOWN"
          unit="%"
          value={risk.account.maxDrawdownPct}
          step={0.1}
          onChange={(n) => set((p) => ({ ...p, account: { ...p.account, maxDrawdownPct: n } }))}
        />
        <Num
          label="MAX OPEN MARGIN"
          unit="%"
          value={risk.account.maxOpenMarginPct}
          step={1}
          onChange={(n) => set((p) => ({ ...p, account: { ...p.account, maxOpenMarginPct: n } }))}
        />
        <Num
          label="MAX SIMULTANEOUS"
          unit="pos"
          value={risk.account.maxSimultaneous}
          step={1}
          onChange={(n) => set((p) => ({ ...p, account: { ...p.account, maxSimultaneous: n } }))}
        />
      </fieldset>

      <fieldset className="rbox">
        <legend>TRADE / STOP SYSTEM</legend>
        <Num
          label="INITIAL HARD STOP"
          unit="pips"
          value={risk.trade.hardStopPips}
          step={1}
          onChange={(n) => set((p) => ({ ...p, trade: { ...p.trade, hardStopPips: n } }))}
        />
        <Num
          label="MAX LOSS / TRADE"
          unit="$"
          value={risk.trade.maxLossPerTrade}
          step={0.1}
          onChange={(n) => set((p) => ({ ...p, trade: { ...p.trade, maxLossPerTrade: n } }))}
        />
        <Num
          label="TRAIL ACTIVATION"
          unit="pips"
          value={risk.trade.trailActivatePips}
          step={1}
          onChange={(n) => set((p) => ({ ...p, trade: { ...p.trade, trailActivatePips: n } }))}
        />
        <Num
          label="TRAIL DISTANCE"
          unit="pips"
          value={risk.trade.trailDistancePips}
          step={1}
          onChange={(n) => set((p) => ({ ...p, trade: { ...p.trade, trailDistancePips: n } }))}
        />
        <Num
          label="BREAK-EVEN AT"
          unit="pips"
          value={risk.trade.breakEvenPips ?? 0}
          step={1}
          onChange={(n) =>
            set((p) => ({ ...p, trade: { ...p.trade, breakEvenPips: n > 0 ? n : null } }))
          }
        />
        <Num
          label="MAX TRADE DURATION"
          unit="min"
          value={risk.trade.maxDurationMin}
          step={15}
          onChange={(n) => set((p) => ({ ...p, trade: { ...p.trade, maxDurationMin: n } }))}
        />
      </fieldset>

      <fieldset className="rbox">
        <legend>PAIR RISK</legend>
        <Num
          label="MAX EXPOSURE / PAIR"
          unit="u"
          value={risk.pair.maxExposureUnits}
          step={10}
          onChange={(n) => set((p) => ({ ...p, pair: { ...p.pair, maxExposureUnits: n } }))}
        />
        <Num
          label="STOP-OUT THRESHOLD"
          unit="R"
          value={risk.pair.stopOutR}
          step={0.1}
          onChange={(n) => set((p) => ({ ...p, pair: { ...p.pair, stopOutR: n } }))}
        />
        <Num
          label="COOLDOWN AFTER STOP"
          unit="min"
          value={risk.pair.cooldownAfterStopMin}
          step={5}
          onChange={(n) => set((p) => ({ ...p, pair: { ...p.pair, cooldownAfterStopMin: n } }))}
        />
        <Num
          label="MAX CONSECUTIVE LOSSES"
          unit=""
          value={risk.pair.maxConsecutiveLosses}
          step={1}
          onChange={(n) => set((p) => ({ ...p, pair: { ...p.pair, maxConsecutiveLosses: n } }))}
        />
        <Num
          label="PAIR LOCK DURATION"
          unit="min"
          value={risk.pair.lockDurationMin}
          step={15}
          onChange={(n) => set((p) => ({ ...p, pair: { ...p.pair, lockDurationMin: n } }))}
        />
        <Num
          label="MAX NET CURRENCY"
          unit="%"
          value={risk.currency.maxNetPct}
          step={1}
          onChange={(n) => set((p) => ({ ...p, currency: { ...p.currency, maxNetPct: n } }))}
        />
      </fieldset>
    </div>
  );
}

function Num({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="rnum">
      <span>{label}</span>
      <span className="rnum-in">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {unit ? <em>{unit}</em> : null}
      </span>
    </label>
  );
}
