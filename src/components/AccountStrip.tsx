import { formatMoney, formatMoneyPlain, formatPct, pnlClass } from '../format';
import { useTerminalStore } from '../store';
import { FlashValue } from './Bits';

export function AccountStrip() {
  const account = useTerminalStore((s) => s.account);
  const equity = useTerminalStore((s) => s.equity);
  const unrealized = useTerminalStore((s) => s.unrealized);
  const dayPnl = useTerminalStore((s) => s.dayPnl);
  const drawdownPct = useTerminalStore((s) => s.drawdownPct);
  const availableMargin = useTerminalStore((s) => s.availableMargin);
  const openCount = useTerminalStore((s) => s.openCount);

  return (
    <section className="acct">
      <Stat label="BALANCE" value={account.balance} format={(n) => formatMoneyPlain(n, 2, account.currency)} />
      <Stat label="EQUITY" value={equity} format={(n) => formatMoneyPlain(n, 2, account.currency)} />
      <Stat label="UNREALIZED" value={unrealized} signed />
      <Stat label="REALIZED TODAY" value={account.realizedToday} signed />
      <Stat label="DAY" value={dayPnl} signed />
      <Stat
        label="TOTAL RETURN"
        value={account.totalReturnPct}
        format={(n) => formatPct(n)}
        signed
      />
      <Stat
        label="DRAW DOWN"
        value={drawdownPct}
        format={(n) => formatPct(n)}
        signed
      />
      <Stat
        label="MAX DD"
        value={account.maxDrawdownPct}
        format={(n) => formatPct(n)}
        signed
      />
      <Stat
        label="MARGIN USED"
        value={account.marginUsedPct}
        format={(n) => `${n.toFixed(0)}%`}
      />
      <Stat
        label="AVAIL MARGIN"
        value={availableMargin}
        format={(n) => `${n.toFixed(0)}%`}
      />
      <Stat label="OPEN POSITIONS" value={openCount} format={(n) => String(n)} />
    </section>
  );
}

function Stat({
  label,
  value,
  format,
  signed,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  signed?: boolean;
}) {
  const text = format ? format(value) : formatMoney(value);
  return (
    <div className="acct-cell">
      <div className="acct-lbl">{label}</div>
      <FlashValue value={value} className={`acct-val ${signed ? pnlClass(value) : ''}`}>
        {text}
      </FlashValue>
    </div>
  );
}
