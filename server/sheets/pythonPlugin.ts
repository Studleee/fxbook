import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';

const PORT = Number(process.env.SHEETS_API_PORT || 5174);

function pythonCommands(): string[][] {
  if (process.env.PYTHON) return [[process.env.PYTHON]];
  return [['python'], ['py', '-3'], ['python3']];
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ host: '127.0.0.1', port }, () => {
        sock.end();
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`sheets-py did not start on ${port}`));
          return;
        }
        setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

function startPython(root: string, mode: string): ChildProcess | null {
  const fileEnv = loadEnv(mode, root, '');
  const env = { ...fileEnv, ...process.env, SHEETS_API_PORT: String(PORT) };
  const script = path.join(root, 'server', 'sheets_py', 'app.py');

  for (const cmd of pythonCommands()) {
    const child = spawn(cmd[0], [...cmd.slice(1), script], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let started = false;
    child.stdout?.on('data', (buf: Buffer) => {
      started = true;
      process.stdout.write(buf);
    });
    child.stderr?.on('data', (buf: Buffer) => {
      started = true;
      process.stderr.write(buf);
    });
    child.on('error', () => {
      /* try next candidate */
    });
    if (child.pid) {
      child.on('exit', (code) => {
        if (code && started) {
          console.error(`[sheets-py] exited ${code}`);
        }
      });
      return child;
    }
  }
  console.error('[sheets-py] Python was not found. Install Python and: pip install -r requirements-sheets.txt');
  return null;
}

export function sheetsPythonPlugin(): Plugin {
  let child: ChildProcess | null = null;

  const stop = () => {
    if (!child || child.killed) return;
    child.kill();
    child = null;
  };

  return {
    name: 'fxbook-sheets-gspread',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    },
    configureServer(server) {
      void (async () => {
        if (await portOpen(PORT)) {
          console.log(`[sheets-py] already listening on 127.0.0.1:${PORT}`);
          return;
        }
        child = startPython(server.config.root, server.config.mode);
        await waitForPort(PORT, 8000).catch((err: Error) => {
          console.error(`[sheets-py] ${err.message}`);
        });
      })();
      server.httpServer?.once('close', stop);
    },
    configurePreviewServer(server) {
      void (async () => {
        if (await portOpen(PORT)) {
          console.log(`[sheets-py] already listening on 127.0.0.1:${PORT}`);
          return;
        }
        child = startPython(server.config.root, server.config.mode);
      })();
      server.httpServer?.once('close', stop);
    },
  };
}
