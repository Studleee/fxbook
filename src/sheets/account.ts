export interface SheetsAccountStatus {
  ok: boolean;
  configured: boolean;
  email: string;
  hasCredentials?: boolean;
  source: 'file' | 'settings' | 'env' | null;
  error?: string;
}

async function readAccount(res: Response): Promise<SheetsAccountStatus> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error('Sheets backend returned an empty response');
  }
  try {
    return JSON.parse(text) as SheetsAccountStatus;
  } catch {
    throw new Error('Sheets backend returned an invalid response');
  }
}

export async function fetchSheetsAccount(): Promise<SheetsAccountStatus> {
  const res = await fetch('/api/sheets/account');
  try {
    const body = await readAccount(res);
    if (!res.ok) {
      return { ok: false, configured: false, email: '', source: null, error: body.error || 'Sheets backend unreachable' };
    }
    return body;
  } catch {
    return { ok: false, configured: false, email: '', source: null, error: 'Sheets backend unreachable' };
  }
}

export async function saveSheetsAccount(
  email: string,
  credentials?: Record<string, unknown>,
): Promise<SheetsAccountStatus> {
  const res = await fetch('/api/sheets/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials ? { email, credentials } : { email }),
  });
  const body = await readAccount(res);
  if (!res.ok || body.error) {
    throw new Error(body.error || 'Could not save service account');
  }
  return body;
}

export async function clearSheetsAccount(): Promise<SheetsAccountStatus> {
  const res = await fetch('/api/sheets/account', { method: 'DELETE' });
  const body = await readAccount(res);
  if (!res.ok) throw new Error(body.error || 'Could not remove service account');
  return body;
}
