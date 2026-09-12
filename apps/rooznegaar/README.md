# Rooznegaar

A calm, local-first planner that connects monthly goals to weekly priorities and daily tasks. The UI is English while dates follow the Jalali calendar, Tehran time, and Saturday-first weeks.

## Run from UsefulApps

```bash
make rooznegaar PORT=3001
```

Run that command from the repository root, replacing `3001` with the desired host port. Open [http://localhost:3001](http://localhost:3001). The container restarts automatically unless explicitly stopped, and SQLite data persists in the `usefulapps-rooznegaar-data` volume.

Use the supported stop command from the repository root:

```bash
make rooznegaar-down
```

The volume is preserved. A JSON backup can also be downloaded from Settings.

## Local development

Requires Node.js 22:

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the Fastify server on port `8787`.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## Architecture

- React, TypeScript, Vite, Recharts, and custom responsive CSS
- Fastify TypeScript API
- SQLite through `better-sqlite3`
- Gregorian ISO storage with Jalali conversion at the application boundary
- One production Node container serving both the API and compiled frontend
