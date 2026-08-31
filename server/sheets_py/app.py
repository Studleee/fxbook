from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

try:
    from server.sheets_py import auth, bindings, writer
    from server.sheets_py.envload import env, load_env
except ImportError:
    import auth
    import bindings
    import writer
    from envload import env, load_env

load_env(ROOT)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write('[sheets-py] ' + (fmt % args) + '\n')

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
        self.wfile.flush()

    def _read_json(self) -> dict:
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b'{}'
        data = json.loads(raw.decode('utf-8') or '{}')
        if not isinstance(data, dict):
            raise ValueError('JSON object required')
        return data

    def do_GET(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == '/api/sheets/health':
                self._send(200, {'ok': True, 'backend': 'gspread'})
                return
            if path == '/api/sheets/account':
                self._send(200, auth.account_status())
                return
            if path == '/api/sheets/bindings':
                self._send(200, {'ok': True, 'bindings': bindings.load_bindings()})
                return
            self._send(404, {'ok': False, 'code': 'write_failed', 'error': 'Not found'})
        except Exception as exc:
            self._send(500, {'ok': False, 'code': 'write_failed', 'error': str(exc)})

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if path != '/api/sheets/bindings':
            self._send(404, {'ok': False, 'code': 'write_failed', 'error': 'Not found'})
            return
        try:
            body = self._read_json()
            patch = body.get('bindings', body)
            if not isinstance(patch, dict):
                raise ValueError('bindings object required')
            saved = bindings.save_bindings(patch)
            self._send(200, {'ok': True, 'bindings': saved})
        except ValueError as exc:
            self._send(400, {'ok': False, 'code': 'invalid_value', 'error': str(exc)})

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if path != '/api/sheets/account':
            self._send(404, {'ok': False, 'code': 'write_failed', 'error': 'Not found'})
            return
        self._send(200, auth.clear_account())

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == '/api/sheets/account':
            try:
                status = auth.save_account(self._read_json())
                self._send(200, status)
            except Exception as exc:
                self._send(400, {'ok': False, 'code': 'auth', 'error': str(exc)})
            return
        if path != '/api/sheets/write':
            self._send(404, {'ok': False, 'code': 'write_failed', 'error': 'Not found'})
            return
        try:
            body = self._read_json()
        except ValueError:
            self._send(400, {'ok': False, 'code': 'invalid_value', 'error': 'Invalid JSON body'})
            return
        pair = body.get('pair')
        setting = body.get('setting')
        if not pair or not setting or 'value' not in body:
            self._send(
                400,
                {'ok': False, 'code': 'invalid_value', 'error': 'pair, setting, and value are required'},
            )
            return
        result = writer.write_pair_value(
            str(pair),
            str(setting),
            body['value'],
            spreadsheet_id=str(body.get('spreadsheetId') or ''),
            sheet_name=str(body.get('sheetName') or ''),
        )
        self._send(200 if result.get('ok') else 400, result)


class SheetsServer(ThreadingHTTPServer):
    allow_reuse_address = False


def main() -> None:
    port = int(env('SHEETS_API_PORT', '5174') or '5174')
    server = SheetsServer(('127.0.0.1', port), Handler)
    print(f'[sheets-py] gspread listening on 127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
