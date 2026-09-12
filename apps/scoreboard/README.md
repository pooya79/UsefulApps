# Personal Scoreboard

A private, mobile-friendly scoreboard for exercise and English-reading lead metrics. It supports daily check-ins, daily and weekly targets, pace-adjusted scores, streaks, charts, historical corrections, CSV export, and JSON-backed metric configuration.

## Run from UsefulApps

```bash
make scoreboard PORT=3000
```

Run that command from the repository root, replacing `3000` with the desired host port. Open `http://localhost:3000` on the host machine, or `http://HOST-IP:3000` from another device on the same home network. The container restarts automatically unless explicitly stopped.

- History is stored in the `usefulapps-scoreboard-data` Docker volume.
- Metric definitions live in [`config/metrics.json`](config/metrics.json) and are mounted read/write into the container.
- The in-app Metrics screen and direct edits to the JSON file update the same configuration.

To stop the app without deleting data:

```bash
make scoreboard-down
```

## Local development

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

The web interface runs at `http://localhost:5173`; API requests are proxied to the development server on port 3001.

Useful checks:

```bash
npm test
npm run build
```

## Metric configuration

Every metric has a stable lowercase ID, label, category, unit, display color, selectable icon, quick-add buttons, and either a daily or weekly target. Icons can be changed from the in-app Metrics screen. Keep IDs stable after recording data. Changing an ID starts a new series; removing a metric hides it from new check-ins but keeps all historical entries available in SQLite and CSV exports.

If a direct JSON edit is invalid, the app continues using the last valid configuration and displays the validation error. In-app edits are validated before being written.

## Backups

Use **Export CSV** in the History screen for a portable copy of all recorded entries. The complete SQLite database is stored in the `usefulapps-scoreboard-data` volume.
