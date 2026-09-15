# IdeaVault

A single-user Markdown workspace for ideas organized into projects and flat, ordered documents. React 19 provides a warm editorial dashboard, split source/preview editor, search, project colors, light/dark/system themes, and mobile Write/Preview tabs. Fastify and SQLite own the library; nothing relies on browser storage except the theme preference.

## Run and stop

From the repository root:

```bash
make ideavault PORT=3002
make ideavault-down
```

Open `http://localhost:3002` (or the host's private-network address). `PORT` is required. Make builds and starts the production container detached, with `restart: unless-stopped` and an HTTP/database health check. The SQLite database, WAL, and shared-memory files live in `/app/data` in the stable named volume `usefulapps-ideavault-data`. Normal shutdown preserves the volume. The Compose project is `usefulapps-ideavault`.

This is a personal app for a trusted local/private network. There is no authentication or multi-user isolation. Do not expose it to the public internet.

## Using the workspace

- Create a project from Overview, choose a color, and optionally add a description.
- Open a project to create documents. Edit the title directly above the Markdown source.
- Saves are debounced by 650 ms and checked against the document revision. Navigation waits for pending saves. If another tab or import changed the document, the draft stays in the editor with an error and Copy draft / Load latest actions. Browser close warns about unsaved text; drafts are not a separate durable backup.
- Use arrow buttons beside projects/documents to reorder them with a mouse, touch, or keyboard. Search matches document titles and Markdown content using SQLite FTS5 word-prefix search (all entered terms must match).
- Markdown supports GFM tables, task lists, code fences, blockquotes, and links. Raw HTML is ignored, unsafe link protocols are removed, and images render as text placeholders. Attachments and image uploads are out of scope.
- In the Markdown editor, Tab inserts four spaces (or indents every selected line); Shift+Tab removes up to four leading spaces.
- Trashing a project hides all its documents. Restoring it keeps individually trashed documents in trash. Restore the parent before restoring a child. Permanent project deletion also deletes its children and records deletion tombstones.
- Theme follows the operating system unless explicitly changed; the choice is remembered on the device.

## Backups and manual synchronization

**Export library** downloads `ideavault-backup-YYYY-MM-DD.json`. It contains format `ideavault`, schema version `1`, export time, all projects/documents (including trash), stable UUIDs, content, revisions, ordering, timestamps, and permanent-deletion tombstones.

**Import backup** validates the full file and shows additions, identical records, differing records, and deletion records/conflicts before writing anything. JSON imports are limited to 25 MB per request; individual document content is limited to 2 million characters. Future versions, invalid relationships, duplicate IDs, invalid fields, and unsupported formats are rejected with an explanation.

- **Merge** keeps local items absent from the backup, adds unknown IDs, and ignores identical records. Every differing record requires an explicit local/imported choice, including metadata, revisions, ordering, trash state, and active-versus-deleted conflicts. Tombstones cannot silently resurrect content. Choosing an imported active record over a local tombstone explicitly restores it.
- Parent/child choices must form a valid library. For example, keeping a document while importing its parent's permanent deletion is rejected; choose consistently and apply again.
- **Replace** requires the prominent confirmation checkbox and replaces the complete library, including trash and tombstones. Export your existing library before replacement if you want a recovery copy.
- Preview is tied to the current library state. If the library changes, select the file again to get a fresh preview. Application is a single SQLite transaction; validation or database failure preserves the existing library and search index.
- Imports that change an existing document advance its revision beyond both local and imported revisions, preventing stale open editors from overwriting it. Other fields are preserved. Thus importing changed records can create a revision difference on the next manual merge; that difference is deliberately reviewed too.

This is manual transfer, not automatic sync. There is no document revision history, cloud service, nested folder structure, or collaboration.

## Architecture and API

- `src/shared/schema.ts`: Zod validation and shared TypeScript models.
- `src/server/database.ts`: SQLite tables, FTS5 indexing triggers, optimistic saves, trash/tombstones, import preview and transactions.
- `src/server/app.ts`: typed request validation and JSON routes. Mutating browser requests require a matching Origin host; development uses the Vite proxy.
- `src/client`: React workspace, accessible native dialogs, editor, safe Markdown renderer, and import review.

Routes under `/api`:

| Route | Method | Purpose |
| --- | --- | --- |
| `/bootstrap` | GET | Complete library for dashboard/navigation |
| `/projects` | POST | Create project |
| `/projects/:id` | PATCH / DELETE | Update metadata / permanently delete trashed project |
| `/documents` | POST | Create in a project |
| `/documents/:id` | GET / PATCH / DELETE | Read / revision-checked save / permanently delete |
| `/projects/reorder`, `/documents/reorder` | POST | Complete ordered ID list; documents also require projectId |
| `/projects/:id/trash`, `/projects/:id/restore` | POST | Trash or restore project |
| `/documents/:id/trash`, `/documents/:id/restore` | POST | Trash or restore document |
| `/search?q=...` | GET | Up to 100 active document matches |
| `/export` | GET | Download complete JSON backup |
| `/import/preview` | POST | Validate backup and return counts, conflicts, library token |
| `/import/apply` | POST | Backup, mode, token, resolutions, and optional confirmReplace |

`GET /health` verifies database access. Production Fastify serves the Vite bundle from the same origin. Default development API port is 3002; runtime container port is 3000. `DATA_PATH` can override the database file for development/testing.

## Development checks

Requires Node.js 22 or later and a native build toolchain if a prebuilt better-sqlite3 binary is unavailable.

```bash
cd apps/ideavault
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Vite serves the development interface at `http://localhost:5173`. Production starts/stops are supported through the root Makefile only. Tests use isolated in-memory databases and cover CRUD, revisions, ordering, FTS, trash, cascade deletion, backup round trips, conflicts, invalid imports, replace confirmation, rollback, and Markdown safety.
