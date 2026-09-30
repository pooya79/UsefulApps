# Markdown Editor

A personal local-file Markdown workspace. React/Vite provides three independently collapsible, resizable panes: Files, Editor, and live Preview. A TypeScript Fastify server reads and writes Markdown directly in a mounted host folder. SQLite stores recent-file history; document content stays in your files.

## Run and stop

From the repository root:

```bash
make markdown-editor PORT=3004
make markdown-editor-down
```

Open <http://localhost:3004>. The default workspace is this repository. To use your own existing folder instead:

```bash
make markdown-editor PORT=3004 FILES_DIR=/home/mint/Documents
```

`PORT` is required (1–65535). `FILES_DIR` may be an absolute or repository-relative existing directory; quote paths containing spaces. The starting folder must be inside `BROWSE_DIR`, which defaults to your home directory. Use **Change workspace** in the app to select another folder without restarting. Set `BROWSE_DIR=/path` when you need to browse a different directory tree; for example, `make markdown-editor PORT=3004 BROWSE_DIR=/mnt/notes FILES_DIR=/mnt/notes/project`. The supported production interface is the root Makefile. It builds the image and starts Docker detached with `restart: unless-stopped`, matching the other apps.

The Compose project is `usefulapps-markdown-editor`. Recent history is stored in `/app/data/markdown-editor.db` in the named volume `usefulapps-markdown-editor-data`. Normal down preserves this volume and all host files. Back up your Markdown folder separately; the history database is not a document backup. Recent history is scoped to the mounted workspace.

## Using the editor

- **Change workspace** appears in the top toolbar and below the connected folder in Files. Browse subfolders, go Up, return to the browsing root with Home folder, or enter a folder path and click Browse. Click **Use this folder** to switch. Pending edits save first; failures preserve the draft and keep the current workspace. The choice is remembered per browser, and each tab keeps its own workspace.
- Browse folders and open `.md`, `.markdown`, or `.mdown` files. Refresh updates the visible folder listings after external changes. The sidebar filter matches files in loaded, expanded folders; expand folders to explore them.
- **New file** and **New folder** create items in the selected folder. Click the workspace folder label to select the root. Names may contain Persian characters. Parent folders must already exist.
- Autosave is enabled initially, with a 700 ms debounce. Toggle it off for manual saving. **Save** and **Ctrl+S / Cmd+S** save the active document. Switching files saves outstanding edits first, including when autosave is off. A failed save keeps the current file open.
- Saves compare the file's content hash with the version you opened, then write through a temporary file and rename. Changes from another tab or local program produce a conflict instead of silently overwriting the newer content. **Download draft** preserves your text; **Load latest** asks before discarding it. A tiny race with unrelated host processes is still possible between the final check and rename; this app does not lock files against external editors.
- Closing or reloading the browser warns when text is unsaved. Unsaved drafts live in memory, so save or download them before closing. Permission errors or conflicts pause autosave until resolved.
- Use Files / Editor / Preview buttons or the pane's close button to show or hide each pane. All panes can be closed and restored. Drag the separators to change widths, or focus a separator and press Left/Right arrows. **Reset pane layout** restores the starting layout.
- On narrow screens, show one pane for a full-width view. Multiple visible panes remain side by side and can be scrolled horizontally.
- Text direction offers **Auto**, **LTR**, and **RTL · فارسی**. Auto uses the first letter for preview direction and the browser's per-paragraph automatic direction in the editor. Persian uses bundled Vazirmatn fonts. Code blocks retain left-to-right layout.
- Formatting buttons insert headings, bold, italics, links, lists, and inline code. Tab inserts two spaces or indents selected lines; Shift+Tab outdents. Toggle source line wrapping; logical line numbers appear with wrapping off.
- Preview supports GFM tables, checkboxes, code fences, links, and safe local PNG/JPEG/GIF/WebP images. Relative Markdown links open in the editor. Raw HTML is ignored, unsafe link protocols are stripped, SVG is unavailable, and external images display placeholders. Files are limited to 2 MB and local images to 20 MB.
- Pane visibility, widths, theme, autosave, wrapping, and direction are remembered in this browser. Recent files are persisted in SQLite.

## Local-file access

The browsing root (your home directory by default) is mounted at `/folders`. The picker can select visible folders within that root; file operations stay confined to the chosen workspace. Hidden files/folders, symlinks, `node_modules`, `dist`, `dist-server`, `coverage`, and `data` directories are excluded. Folders outside the configured browsing root are unavailable. There is no delete action or upload endpoint. Writes run as your host UID/GID to preserve file ownership and respect folder permissions. Atomic saves require write permission on the containing directory.

The port is bound to **127.0.0.1**, and browser API access rejects cross-origin requests. This is a single-user local app with no authentication; do not publish it through a public proxy. The connected path shown in the interface is the selected host folder.

## Development

Requires Node.js 22+ and a native compiler if `better-sqlite3` has no prebuilt binary.

```bash
cd apps/markdown-editor
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Vite serves the development UI at <http://localhost:5173> and proxies `/api` to the Fastify server on 3004. `PORT`, `FILES_ROOT` (browsing root), `WORKSPACE_LABEL` (host browsing root), `INITIAL_WORKSPACE` (host starting folder), and `DATA_PATH` can override development defaults. The default local API root is the repository, and SQLite is under the app's ignored `data/` directory.

`src/server/workspace.ts` owns path confinement, file operations, optimistic saves, and SQLite. `src/server/app.ts` validates routes. `src/client` owns the editor and safe Markdown rendering. Tests use temporary directories and isolated SQLite databases to verify disk writes, conflicts, path traversal, symlinks, Persian names/content, persistence, size limits, cross-origin requests, and preview safety.
