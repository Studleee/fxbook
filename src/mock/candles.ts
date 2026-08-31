import type { Candle } from '../models';
import { mulberry32, pipSize } from '../format';

export function generateCandles(
  pair: string,
  base: number,
  seed: number,
  count = 180,
  intervalSec = 300,
): Candle[] {
  const rand = mulberry32(seed);
  const pip = pipSize(pair);
  const now = Math.floor(Date.now() / 1000);
  const end = now - (now % intervalSec);
  let price = base;
  const candles: Candle[] = [];

  for (let i = count; i >= 1; i--) {
    const time = end - i * intervalSec;
    const drift = (rand() - 0.48) * pip * 8;
    const shock = rand() > 0.97 ? (rand() - 0.5) * pip * 40 : 0;
    const open = price;
    const close = Math.max(pip, open + drift + shock);
    const wick = pip * (2 + rand() * 10);
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    candles.push({ time, open, high, low, close });
    price = close;
  }

  return candles;
}
