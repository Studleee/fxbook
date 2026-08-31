import type { Candle, Quote } from '../../models';
import { DESK_PAIRS, toInstrument } from './format';
import { mapAccount, mapCandles, mapPositions, mapQuote } from './map';
import type {
  OandaAccountRef,
  OandaAccountSummary,
  OandaCandle,
  OandaEnv,
  OandaErrorBody,
  OandaPosition,
  OandaPrice,
  OandaTrade,
  OandaTransaction,
} from './types';

function basePath(env: OandaEnv): string {
  return env === 'LIVE' ? '/oanda/live' : '/oanda/practice';
}

export class OandaHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function oandaFetch<T>(
  env: OandaEnv,
  token: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${basePath(env)}${path}`, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      'Accept-Datetime-Format': 'RFC3339',
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & OandaErrorBody;
  if (!res.ok) {
    throw new OandaHttpError(
      res.status,
      body.errorMessage || `OANDA ${res.status} ${res.statusText}`,
    );
  }
  return body;
}

export async function listAccounts(env: OandaEnv, token: string): Promise<OandaAccountRef[]> {
  const data = await oandaFetch<{ accounts: OandaAccountRef[] }>(env, token, '/v3/accounts');
  return data.accounts ?? [];
}

export async function getSummary(env: OandaEnv, token: string, accountId: string) {
  const data = await oandaFetch<{ account: OandaAccountSummary }>(
    env,
    token,
    `/v3/accounts/${encodeURIComponent(accountId)}/summary`,
  );
  return mapAccount(data.account);
}

export async function getPricing(
  env: OandaEnv,
  token: string,
  accountId: string,
  pairs = DESK_PAIRS as readonly string[],
): Promise<Record<string, Quote>> {
  const instruments = pairs.map(toInstrument).join(',');
  const data = await oandaFetch<{ prices: OandaPrice[] }>(
    env,
    token,
    `/v3/accounts/${encodeURIComponent(accountId)}/pricing?instruments=${encodeURIComponent(instruments)}`,
  );
  const quotes: Record<string, Quote> = {};
  for (const p of data.prices ?? []) {
    const mapped = mapQuote(p);
    if (mapped) quotes[mapped.pair] = mapped.quote;
  }
  return quotes;
}

export async function getCandles(
  env: OandaEnv,
  token: string,
  instrumentPair: string,
  accountId: string,
  granularity = 'M5',
  count = 180,
): Promise<Candle[]> {
  const ins = toInstrument(instrumentPair);
  const q = `granularity=${granularity}&count=${count}&price=M`;
  try {
    const data = await oandaFetch<{ candles: OandaCandle[] }>(
      env,
      token,
      `/v3/instruments/${ins}/candles?${q}`,
    );
    return mapCandles(data.candles ?? []);
  } catch {
    const data = await oandaFetch<{ candles: OandaCandle[] }>(
      env,
      token,
      `/v3/accounts/${encodeURIComponent(accountId)}/instruments/${ins}/candles?${q}`,
    );
    return mapCandles(data.candles ?? []);
  }
}

export async function getOpenBook(env: OandaEnv, token: string, accountId: string) {
  const id = encodeURIComponent(accountId);
  const [posBody, tradeBody] = await Promise.all([
    oandaFetch<{ positions: OandaPosition[] }>(env, token, `/v3/accounts/${id}/openPositions`),
    oandaFetch<{ trades: OandaTrade[] }>(env, token, `/v3/accounts/${id}/openTrades`),
  ]);
  return mapPositions(posBody.positions ?? [], tradeBody.trades ?? []);
}

function normalizeOandaPagePath(pageUrl: string): string {
  const trimmed = pageUrl.trim();
  if (trimmed.startsWith('http')) {
    const url = new URL(trimmed);
    return url.pathname + url.search;
  }
  return trimmed.startsWith('/v3') ? trimmed : `/v3${trimmed}`;
}

/** Fetch account transactions for a date range and build equity-relevant rows. */
export async function getTransactionsInRange(
  env: OandaEnv,
  token: string,
  accountId: string,
  from: Date,
  to: Date,
): Promise<OandaTransaction[]> {
  const id = encodeURIComponent(accountId);
  const q = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    pageSize: '1000',
  });
  const index = await oandaFetch<{ pages?: string[] }>(
    env,
    token,
    `/v3/accounts/${id}/transactions?${q}`,
  );
  const transactions: OandaTransaction[] = [];
  for (const page of index.pages ?? []) {
    const body = await oandaFetch<{ transactions?: OandaTransaction[] }>(
      env,
      token,
      normalizeOandaPagePath(page),
    );
    transactions.push(...(body.transactions ?? []));
  }
  return transactions;
}
