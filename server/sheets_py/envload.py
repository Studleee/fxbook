from pathlib import Path
import os


def load_env(root: Path) -> None:
    path = root / '.env'
    if not path.is_file():
        return
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        value = value.replace('\\n', '\n')
        if key and os.environ.get(key) in (None, ''):
            os.environ[key] = value


def env(name: str, default: str = '') -> str:
    return (os.environ.get(name) or default).strip()
