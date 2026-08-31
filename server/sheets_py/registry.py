from __future__ import annotations

DESK_PAIRS = (
    'EUR/USD',
    'USD/CAD',
    'AUD/CHF',
    'AUD/JPY',
    'AUD/NZD',
    'EUR/GBP',
    'EUR/CHF',
    'GBP/USD',
    'USD/SGD',
)


def to_slash_pair(pair: str) -> str:
    raw = pair.strip().upper().replace('-', '/')
    if '/' in raw:
        return raw
    key = raw.replace('_', '')
    if len(key) == 6:
        return f'{key[:3]}/{key[3:]}'
    return raw.replace('_', '/')


def to_pair_key(pair: str) -> str:
    return to_slash_pair(pair).replace('/', '_')


def is_known_pair(pair: str) -> bool:
    return to_slash_pair(pair) in DESK_PAIRS


def spreadsheet_id_for(pair: str) -> str:
    from .envload import env

    return env(f'SHEET_ID_{to_pair_key(pair)}')


def sheet_name_for(pair: str) -> str:
    from .envload import env

    return env(f'SHEET_TAB_{to_pair_key(pair)}') or env('SHEET_TAB_DEFAULT', 'Trade Management')
