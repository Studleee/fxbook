from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import gspread

from .envload import env

ROOT = Path(__file__).resolve().parents[2]
CREDENTIAL_FILE = ROOT / 'backend' / 'credentials' / 'google-service-account.json'
EMAIL_FILE = Path(__file__).with_name('service_account.local.json')
_client: Optional[gspread.Client] = None


def reset_client() -> None:
    global _client
    _client = None


def _resolve(raw: str) -> Optional[Path]:
    if not raw:
        return None
    path = Path(raw)
    if path.is_file():
        return path
    alt = ROOT / raw
    return alt if alt.is_file() else None


def credential_path() -> Optional[Path]:
    for raw in (
        env('GOOGLE_SERVICE_ACCOUNT_FILE'),
        env('GOOGLE_APPLICATION_CREDENTIALS'),
        str(CREDENTIAL_FILE),
        'backend/credentials/google-service-account.json',
    ):
        found = _resolve(raw)
        if found:
            return found
    return None


def _email_from_file(path: Path) -> str:
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return ''
    if not isinstance(data, dict):
        return ''
    return str(data.get('client_email') or data.get('email') or '').strip()


def _saved_email() -> str:
    if not EMAIL_FILE.is_file():
        return ''
    try:
        data = json.loads(EMAIL_FILE.read_text(encoding='utf-8'))
    except Exception:
        return ''
    if not isinstance(data, dict):
        return ''
    return str(data.get('client_email') or data.get('email') or '').strip()


def account_status() -> dict:
    path = credential_path()
    email = _saved_email() or (_email_from_file(path) if path else '')
    if _saved_email():
        source = 'settings'
    elif path:
        source = 'file'
    else:
        source = None
    return {
        'ok': True,
        'configured': bool(email),
        'email': email,
        'hasCredentials': path is not None,
        'source': source,
    }


def save_credentials(info: dict) -> None:
    if info.get('type') != 'service_account' or not str(info.get('client_email') or '').strip():
        raise ValueError('That file is not a Google service account JSON')
    CREDENTIAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    CREDENTIAL_FILE.write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    reset_client()


def save_account(raw: dict) -> dict:
    creds = raw.get('credentials')
    if isinstance(creds, dict):
        save_credentials(creds)
        if not str(raw.get('email') or '').strip():
            raw = {**raw, 'email': creds.get('client_email')}
    email = str(raw.get('email') or raw.get('client_email') or '').strip()
    if '@' not in email:
        raise ValueError('Service account email is required')
    EMAIL_FILE.write_text(json.dumps({'client_email': email}, indent=2) + '\n', encoding='utf-8')
    reset_client()
    return account_status()


def clear_account() -> dict:
    if EMAIL_FILE.is_file():
        EMAIL_FILE.unlink()
    if CREDENTIAL_FILE.is_file():
        CREDENTIAL_FILE.unlink()
    reset_client()
    return account_status()


def sheets_client() -> gspread.Client:
    global _client
    if _client is not None:
        return _client
    path = credential_path()
    if not path:
        raise RuntimeError('backend/credentials/google-service-account.json is missing')
    _client = gspread.service_account(filename=str(path))
    return _client
