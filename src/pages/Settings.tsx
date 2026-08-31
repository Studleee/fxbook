import { useEffect, useState } from 'react';
import { formatMoneyPlain, formatPrice, formatTime } from '../format';
import { maskToken } from '../services/oanda/storage';
import {
  clearSheetsAccount,
  fetchSheetsAccount,
  saveSheetsAccount,
  type SheetsAccountStatus,
} from '../sheets/account';
import { useTerminalStore } from '../store';

export function Settings() {
  const env = useTerminalStore((s) => s.brokerEnv);
  const token = useTerminalStore((s) => s.brokerToken);
  const accountId = useTerminalStore((s) => s.brokerAccountId);
  const accounts = useTerminalStore((s) => s.brokerAccounts);
  const error = useTerminalStore((s) => s.brokerError);
  const busy = useTerminalStore((s) => s.brokerBusy);
  const dataSource = useTerminalStore((s) => s.dataSource);
  const system = useTerminalStore((s) => s.system);
  const setBrokerEnv = useTerminalStore((s) => s.setBrokerEnv);
  const setBrokerToken = useTerminalStore((s) => s.setBrokerToken);
  const setBrokerAccountId = useTerminalStore((s) => s.setBrokerAccountId);
  const loadBrokerAccounts = useTerminalStore((s) => s.loadBrokerAccounts);
  const connectBroker = useTerminalStore((s) => s.connectBroker);
  const disconnectBroker = useTerminalStore((s) => s.disconnectBroker);
  const forgetBroker = useTerminalStore((s) => s.forgetBroker);
  const connected = dataSource === 'oanda';

  return (
    <div className="settings-page">
      <section className="rbox settings-hero">
        <div className="pane-h">
          <span>BROKER CONNECTION</span>
          <span>{connected ? system.brokerName : 'SIM / MOCK'}</span>
        </div>
        <div className="settings-body">
          <p className="settings-lead">
            Pull OANDA account, prices, candles, and open positions into the desk. No orders are
            sent. Keys stay on this machine (local storage) — never in source.
          </p>

          <div className="settings-env">
            <button
              className={`btn ${env === 'PAPER' ? 'btn-ok' : ''}`}
              onClick={() => setBrokerEnv('PAPER')}
              disabled={connected}
            >
              PAPER
            </button>
            <button
              className={`btn ${env === 'LIVE' ? 'btn-danger' : ''}`}
              onClick={() => setBrokerEnv('LIVE')}
              disabled={connected}
            >
              LIVE
            </button>
            {env === 'LIVE' && (
              <span className="ctrl-note neg">
                LIVE reads your real fxTrade account. Execution is still disabled.
              </span>
            )}
          </div>

          <label className="rnum settings-field">
            <span>API TOKEN</span>
            <input
              className="settings-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="OANDA personal access token"
              value={token}
              onChange={(e) => setBrokerToken(e.target.value)}
              disabled={connected}
            />
          </label>
          {token ? <div className="ctrl-note">Saved as {maskToken(token)}</div> : null}

          <label className="rnum settings-field">
            <span>ACCOUNT ID</span>
            <span className="settings-account">
              {accounts.length > 0 ? (
                <select
                  className="settings-input"
                  value={accountId}
                  onChange={(e) => setBrokerAccountId(e.target.value)}
                  disabled={connected}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                      {a.alias ? ` · ${a.alias}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="settings-input"
                  value={accountId}
                  placeholder="001-001-xxxxxxx-001"
                  onChange={(e) => setBrokerAccountId(e.target.value.trim())}
                  disabled={connected}
                />
              )}
            </span>
          </label>

          {error ? <div className="settings-error">{error}</div> : null}

          {connected ? (
            <FeedConfirm />
          ) : (
            <div className="settings-warn">
              Not confirmed — still SIM mock data. Paste your token, load accounts, then CONNECT DATA.
            </div>
          )}

          <div className="settings-actions">
            <button className="btn" disabled={busy || connected || !token} onClick={() => void loadBrokerAccounts()}>
              LOAD ACCOUNTS
            </button>
            {connected ? (
              <button className="btn btn-warn" onClick={disconnectBroker}>
                DISCONNECT
              </button>
            ) : (
              <button className="btn btn-ok" disabled={busy || !token || !accountId} onClick={() => void connectBroker()}>
                {busy ? 'CONNECTING…' : 'CONNECT DATA'}
              </button>
            )}
            <button className="btn btn-danger" onClick={forgetBroker}>
              REMOVE SAVED KEY
            </button>
          </div>

          <ul className="ph-list">
            <li>Create a token in OANDA: Manage API Access</li>
            <li>PAPER uses api-fxpractice · LIVE uses api-fxtrade</li>
            <li>Connect, then open DESK — bid/ask, chart, account strip, and positions come from OANDA</li>
            <li>ADD / CLOSE / REDUCE stay blocked until execution is enabled in a later stage</li>
          </ul>
        </div>
      </section>

      <SheetsConnection />
    </div>
  );
}

function SheetsConnection() {
  const [status, setStatus] = useState<SheetsAccountStatus | null>(null);
  const [email, setEmail] = useState('');
  const [credentials, setCredentials] = useState<Record<string, unknown> | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = Boolean(status?.configured);
  const hasCredentials = Boolean(status?.hasCredentials);

  useEffect(() => {
    void fetchSheetsAccount()
      .then((next) => {
        setStatus(next);
        if (next.email) setEmail(next.email);
      })
      .catch(() =>
        setStatus({
          ok: false,
          configured: false,
          email: '',
          source: null,
          error: 'Sheets backend unreachable',
        }),
      );
  }, []);

  async function onPickFile(file: File | null) {
    setError(null);
    setCredentials(null);
    setFileName('');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.type !== 'service_account' || typeof parsed.client_email !== 'string') {
        setError('That file is not a Google service account JSON');
        return;
      }
      setCredentials(parsed);
      setFileName(file.name);
      if (!email && parsed.client_email) setEmail(String(parsed.client_email));
    } catch {
      setError('Could not read that JSON file');
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const next = await saveSheetsAccount(email, credentials ?? undefined);
      setStatus(next);
      if (next.email) setEmail(next.email);
      setCredentials(null);
      setFileName('');
      void useTerminalStore.getState().refreshSheetsStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save service account');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await clearSheetsAccount());
      setEmail('');
      setCredentials(null);
      setFileName('');
      void useTerminalStore.getState().refreshSheetsStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove service account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rbox settings-hero settings-hero-sheets">
      <div className="pane-h">
        <span>SHEETS CONNECTION</span>
        <span>{configured ? 'CONNECTED' : 'NOT CONNECTED'}</span>
      </div>
      <div className="settings-body">
        <label className="settings-email-field">
          <span>SERVICE ACCOUNT EMAIL</span>
          <input
            className="settings-input settings-email-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="name@project.iam.gserviceaccount.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={configured}
          />
        </label>

        <label className="settings-email-field">
          <span>GSPREAD JSON</span>
          <span className="settings-file-row">
            <input
              className="settings-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            <span className="ctrl-note">
              {hasCredentials && !fileName
                ? 'Saved on the backend'
                : fileName || 'backend/credentials/google-service-account.json'}
            </span>
          </span>
        </label>

        {error || status?.error ? <div className="settings-error">{error || status?.error}</div> : null}

        <div className="settings-actions">
          {configured ? (
            <>
              {credentials ? (
                <button className="btn btn-ok" disabled={busy} onClick={() => void connect()}>
                  {busy ? 'SAVING…' : 'SAVE JSON'}
                </button>
              ) : null}
              <button className="btn btn-warn" disabled={busy} onClick={() => void remove()}>
                DISCONNECT
              </button>
            </>
          ) : (
            <button
              className="btn btn-ok"
              disabled={busy || !email.includes('@')}
              onClick={() => void connect()}
            >
              {busy ? 'SAVING…' : 'CONNECT'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FeedConfirm() {
  const system = useTerminalStore((s) => s.system);
  const account = useTerminalStore((s) => s.account);
  const equity = useTerminalStore((s) => s.equity);
  const openCount = useTerminalStore((s) => s.openCount);
  const quotes = useTerminalStore((s) => s.quotes);
  const selectedPair = useTerminalStore((s) => s.selectedPair);
  const lastFeedAt = useTerminalStore((s) => s.lastFeedAt);
  const brokerAlias = useTerminalStore((s) => s.brokerAlias);
  const brokerAccountId = useTerminalStore((s) => s.brokerAccountId);
  const brokerTick = useTerminalStore((s) => s.brokerTick);
  const clock = useTerminalStore((s) => s.system.clock);

  const pair = quotes[selectedPair] ? selectedPair : Object.keys(quotes)[0] ?? selectedPair;
  const quote = quotes[pair];
  const quoteCount = Object.keys(quotes).length;
  const ageMs = lastFeedAt ? Date.now() - lastFeedAt : null;
  const live = ageMs !== null && ageMs < 5000;

  return (
    <div className="settings-feed">
      <div className="pane-h">
        <span>{live ? 'FEED CONFIRMED' : 'FEED STALE'}</span>
        <span>
          {system.brokerName}
          {brokerAlias ? ` · ${brokerAlias}` : ''}
        </span>
      </div>
      <div className="settings-feed-grid">
        <FeedRow label="ACCOUNT" value={brokerAccountId} />
        <FeedRow label="BALANCE" value={formatMoneyPlain(account.balance, 2, account.currency)} />
        <FeedRow label="EQUITY" value={formatMoneyPlain(equity, 2, account.currency)} />
        <FeedRow label="POSITIONS" value={String(openCount)} />
        <FeedRow label="QUOTES" value={`${quoteCount} pairs`} />
        <FeedRow
          label={pair}
          value={
            quote
              ? `${formatPrice(pair, quote.bid)} / ${formatPrice(pair, quote.ask)}  ${quote.spreadPips.toFixed(1)} pip`
              : '—'
          }
        />
        <FeedRow
          label="LAST TICK"
          value={lastFeedAt ? `${formatTime(lastFeedAt)} · poll ${brokerTick}` : '—'}
        />
        <FeedRow label="CLOCK" value={clock} />
      </div>
    </div>
  );
}

function FeedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rnum">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
