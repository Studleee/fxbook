from __future__ import annotations

from typing import Any

import gspread

from . import auth, bindings, registry


def _serialize(value: str | int | float | bool) -> str | int | float:
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    return value


def write_pair_value(
    pair: str,
    setting: str,
    value: str | int | float | bool,
    spreadsheet_id: str = '',
    sheet_name: str = '',
) -> dict[str, Any]:
    if not registry.is_known_pair(pair):
        return {'ok': False, 'code': 'unknown_pair', 'error': f'Unknown pair {pair}'}
    if not bindings.is_pair_setting(setting):
        return {'ok': False, 'code': 'unknown_setting', 'error': f'Unknown setting {setting}'}

    slash = registry.to_slash_pair(pair)
    sid = spreadsheet_id.strip() or registry.spreadsheet_id_for(slash)
    tab = sheet_name.strip() or registry.sheet_name_for(slash)
    if not sid:
        return {
            'ok': False,
            'code': 'missing_spreadsheet',
            'error': f'No spreadsheet for {slash} — paste the link in the sheets gear',
        }

    cell = bindings.resolve_cell(setting)
    if not cell:
        return {'ok': False, 'code': 'missing_binding', 'error': f'No cell binding for {setting}'}

    try:
        client = auth.sheets_client()
    except FileNotFoundError:
        return {
            'ok': False,
            'code': 'auth',
            'error': 'Attach the gspread JSON in SETTINGS',
        }
    except Exception as exc:
        message = str(exc) or 'Google authentication failed'
        if 'google-service-account.json' in message.replace('\\', '/') or 'service_account.json' in message.replace(
            '\\', '/'
        ):
            message = 'Attach the gspread JSON in SETTINGS'
        return {'ok': False, 'code': 'auth', 'error': message}

    try:
        book = client.open_by_key(sid)
        ws = book.worksheet(tab)
        ws.update_acell(cell, _serialize(value))
    except gspread.exceptions.SpreadsheetNotFound:
        return {'ok': False, 'code': 'spreadsheet_not_found', 'error': 'Spreadsheet not found'}
    except gspread.exceptions.WorksheetNotFound:
        return {'ok': False, 'code': 'sheet_not_found', 'error': 'Worksheet / tab not found'}
    except gspread.exceptions.APIError as exc:
        status = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status in {401, 403}:
            return {'ok': False, 'code': 'auth', 'error': 'Google authentication failed'}
        return {'ok': False, 'code': 'write_failed', 'error': 'Google Sheets write failed'}
    except Exception:
        return {'ok': False, 'code': 'network', 'error': 'Network error talking to Google Sheets'}

    return {'ok': True, 'pair': slash, 'setting': setting}
