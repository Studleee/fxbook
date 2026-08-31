# fxbook

Desktop-first **forex book terminal** — watch pairs, risk, and positions.

Stage 1–2 are the desk shell and risk governor. OANDA can stream account/prices/positions. No live orders. No algo engine.

```bash
npm install
pip install -r requirements-sheets.txt
npm run dev
```

Sheets writes go through Python **gspread**: one service account, `SHEET_ID_*` per pair, and one cell-binding map for every pair. Copy `.env.example` to `.env` and share each spreadsheet with the service-account email.

Open [http://localhost:5173](http://localhost:5173). Built for 1440×900 and up.
