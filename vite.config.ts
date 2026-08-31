import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sheetsPythonPlugin } from './server/sheets/pythonPlugin';

const sheetsProxy = {
  '/api/sheets': {
    target: 'http://127.0.0.1:5174',
    changeOrigin: true,
  },
};

const oandaProxy = {
  '/oanda/practice': {
    target: 'https://api-fxpractice.oanda.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/oanda\/practice/, ''),
  },
  '/oanda/live': {
    target: 'https://api-fxtrade.oanda.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/oanda\/live/, ''),
  },
};

export default defineConfig({
  plugins: [react(), sheetsPythonPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { ...sheetsProxy, ...oandaProxy },
  },
  preview: {
    proxy: { ...sheetsProxy, ...oandaProxy },
  },
});
