# UsefulApps

A collection of small, self-hosted TypeScript applications. Every app runs in Docker, persists its data in SQLite, starts in the background, and is managed through the root `Makefile`.

## Requirements

- Docker Engine with Docker Compose v2
- GNU Make

No host installation of Node.js or SQLite is needed to run the apps.

## Commands

Run `make help` at any time to see the command list.

### Rooznegaar

Rooznegaar is a Jalali-calendar planner for monthly goals, weekly priorities, and daily tasks.

```bash
make rooznegaar PORT=3001
```

Open <http://localhost:3001>. Stop it with:

```bash
make rooznegaar-down
```

### Scoreboard

Scoreboard tracks exercise and English-reading lead metrics, targets, pace, streaks, and history.

```bash
make scoreboard PORT=3000
```

Open <http://localhost:3000>. Stop it with:

```bash
make scoreboard-down
```

`PORT` is required for every run command and must be an integer from `1` through `65535`. Choose different ports when running both apps at once.

## Runtime and data

Both run commands build their image, start the app in detached mode, and configure Docker to restart it unless it is explicitly stopped. Use the app's `make ...-down` command as the single supported way to stop it.

SQLite data is kept in named Docker volumes and is preserved by the down commands:

- Rooznegaar: `usefulapps-rooznegaar-data`
- Scoreboard: `usefulapps-scoreboard-data`

Scoreboard's metric definitions are stored in [`apps/scoreboard/config/metrics.json`](apps/scoreboard/config/metrics.json) and mounted into its container. Rooznegaar offers a JSON backup from its Settings screen; Scoreboard can export CSV from History.

## Repository structure

```text
.
├── Makefile
├── apps
│   ├── rooznegaar
│   └── scoreboard
├── AGENTS.md
└── README.md
```

Each application owns its TypeScript source, tests, package lock, Docker image, Compose definition, and app-specific documentation.

## Development checks

To run an app's checks directly, enter its directory and use its npm scripts. Node.js 22 or later is required for host-side development.

```bash
cd apps/rooznegaar
npm ci
npm test
npm run typecheck
npm run build
```

```bash
cd apps/scoreboard
npm ci
npm test
npm run build
```
