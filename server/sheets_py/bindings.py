from __future__ import annotations

import json
import re
from pathlib import Path

PAIR_SETTINGS = (
    'lockoutHours',
    'stopLossPips',
    'takeProfitPips',
    'trailingStartPips',
    'trailingDistancePips',
    'tradingEnabled',
    'maxPositionSize',
    'closePosition',
    'closePair',
    'manualBuy',
    'manualSell',
)

# One map for every pair. Do not add per-pair cell overrides.
DEFAULT_BINDINGS: dict[str, str] = {
    'lockoutHours': 'D3',
    'stopLossPips': 'D4',
    'takeProfitPips': 'D7',
    'trailingStartPips': 'D5',
    'trailingDistancePips': 'D6',
    'tradingEnabled': 'D8',
    'maxPositionSize': 'D9',
    'closePosition': 'D10',
    'closePair': 'D11',
    'manualBuy': 'D12',
    'manualSell': 'D13',
}

A1 = re.compile(r'^[A-Z]{1,3}[1-9][0-9]{0,3}$')
LOCAL_FILE = Path(__file__).with_name('bindings.local.json')


def is_pair_setting(name: str) -> bool:
    return name in PAIR_SETTINGS


def normalize_cell(value: str) -> str | None:
    cell = value.strip().upper()
    return cell if A1.match(cell) else None


def _read_local() -> dict[str, str]:
    if not LOCAL_FILE.is_file():
        return {}
    try:
        data = json.loads(LOCAL_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, raw in data.items():
        if key in PAIR_SETTINGS and isinstance(raw, str):
            cell = normalize_cell(raw)
            if cell:
                out[key] = cell
    return out


def load_bindings() -> dict[str, str]:
    return {**DEFAULT_BINDINGS, **_read_local()}


def resolve_cell(setting: str) -> str | None:
    cell = load_bindings().get(setting, '').strip()
    return cell or None


def save_bindings(patch: dict) -> dict[str, str]:
    current = _read_local()
    for key, raw in patch.items():
        if key not in PAIR_SETTINGS:
            continue
        if not isinstance(raw, str):
            continue
        cell = normalize_cell(raw)
        if cell:
            current[key] = cell
    LOCAL_FILE.write_text(json.dumps(current, indent=2) + '\n', encoding='utf-8')
    return load_bindings()
