# AGENTS.md

## Purpose

This repository contains independent, small web applications with a consistent operating contract. Keep each app self-contained under `apps/<app-name>` and preserve the root Makefile as the public interface for running and stopping apps.

## Repository rules

- TypeScript is the main implementation language for every app. Framework choice is app-specific.
- SQLite is the only database. Do not add external database services or require a host database.
- Every app must have a production Dockerfile and a Docker Compose definition.
- Production containers must run detached through Make and use `restart: unless-stopped`.
- Every app must have a root Make run target that requires `PORT=<number>` and a matching root Make down target.
- The documented and supported way to start or stop an app is through the root Makefile.
- Persistent SQLite files belong in named Docker volumes. A normal down command must not delete those volumes.
- Commit dependency lockfiles. Do not commit `node_modules`, compiled output, coverage, SQLite files, secrets, or local environment files.

## Naming convention

For an app at `apps/example`, expose these root targets:

```text
make example PORT=3000
make example-down
```

Add both commands to `make help` and the root README. Give its Compose project and persistent volumes stable, repository-specific names so they do not collide with unrelated projects.

## Change workflow

1. Read the app's own README and package scripts before changing it.
2. Keep changes scoped to the relevant app unless the repository contract changes.
3. Run the app's tests, type checks when provided, and production build.
4. Validate the Compose file and exercise the root Make run/down commands when Docker is available.
5. Update both app-level and root documentation when commands, ports, configuration, or persistence behavior changes.

## Current applications

- `apps/rooznegaar`: React/Vite frontend with a Fastify API and `better-sqlite3`.
- `apps/scoreboard`: React/Vite frontend with a Fastify API and `better-sqlite3`.
- `apps/ideavault`: React/Vite Markdown workspace with a Fastify API and `better-sqlite3`.
