import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FlashValue({
  value,
  className = '',
  children,
}: {
  value: number;
  className?: string;
  children: ReactNode;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? 'flash-up' : 'flash-down');
    prev.current = value;
    const t = window.setTimeout(() => setFlash(''), 450);
    return () => window.clearTimeout(t);
  }, [value]);

  return <span className={`${className} ${flash}`.trim()}>{children}</span>;
}

export function StatusLed({
  status,
}: {
  status: 'connected' | 'degraded' | 'disconnected';
}) {
  const cls = status === 'connected' ? 'ok' : status === 'degraded' ? 'warn' : 'bad';
  return <i className={`led led-${cls}`} />;
}

export function StatusDot({
  status,
}: {
  status: 'RUNNING' | 'PAUSED' | 'LOCKED' | 'COOLDOWN' | 'ERROR' | 'DISABLED';
}) {
  const map = {
    RUNNING: 'ok',
    PAUSED: 'warn',
    LOCKED: 'warn',
    COOLDOWN: 'warn',
    ERROR: 'bad',
    DISABLED: 'off',
  } as const;
  return <i className={`led led-${map[status]}`} />;
}
