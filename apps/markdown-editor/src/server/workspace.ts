import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import type { Document, Entry } from '../shared/types.js';
export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const markdown = /\.(md|markdown|mdown)$/i;
const ignored = new Set(['node_modules', 'dist', 'dist-server', 'coverage', 'data']);
const limit = 2 * 1024 * 1024;
export const revisionOf = (content: string) => createHash('sha256').update(content).digest('hex');
export class Workspace {
  readonly root: string;
  readonly db: Database.Database;
  readonly identity: string;
  constructor(root: string, database: string | Database.Database = ':memory:', identity?: string) {
    this.root = realpathSync(root);
    this.identity = identity || this.root;
    this.db = typeof database === 'string' ? new Database(database) : database;
    if (typeof database === 'string') this.db.pragma('journal_mode = WAL');
    if (typeof database === 'string') this.db.exec('CREATE TABLE IF NOT EXISTS recent (root TEXT NOT NULL, path TEXT NOT NULL, opened TEXT NOT NULL, PRIMARY KEY(root,path))');
  }
  at(path: string) {
    const target = this.safePath(path);
    if (!lstatSync(target).isDirectory()) throw new HttpError(400, 'Choose a folder.');
    // All folder views share the database, while history is keyed by the host path.
    return path ? new Workspace(target, this.db, join(this.identity, path)) : this;
  }
  // Walk every component: links (even links inside the workspace) are intentionally unavailable.
  private safePath(path: string, allowMissing = false) {
    if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(p => p === '..' || p.startsWith('.') || ignored.has(p))) throw new HttpError(400, 'Choose a visible path inside the workspace.');
    const target = resolve(this.root, path);
    if (relative(this.root, target).split(sep)[0] === '..' || isAbsolute(relative(this.root, target))) throw new HttpError(403, 'Path is outside the workspace.');
    const parts = relative(this.root, target).split(sep).filter(Boolean);
    let current = this.root;
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i]);
      if (allowMissing && i === parts.length - 1 && !existsSync(current)) continue;
      let stat;
      try { stat = lstatSync(current); } catch { throw new HttpError(404, 'File or folder no longer exists. Refresh the file list.'); }
      if (stat.isSymbolicLink()) throw new HttpError(403, 'Symbolic links are not available in this workspace.');
      const real = realpathSync(current);
      if (relative(this.root, real).split(sep)[0] === '..' || isAbsolute(relative(this.root, real))) throw new HttpError(403, 'Path is outside the workspace.');
    }
    return target;
  }
  list(path = ''): Entry[] {
    const target = this.safePath(path);
    if (!lstatSync(target).isDirectory()) throw new HttpError(400, 'Choose a folder.');
    return readdirSync(target, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && !ignored.has(e.name) && !e.isSymbolicLink() && (e.isDirectory() || e.isFile() && markdown.test(e.name)))
      .map(e => ({ name: e.name, path: path ? `${path}/${e.name}` : e.name, kind: e.isDirectory() ? 'directory' as const : 'file' as const }))
      .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
  }
  read(path: string, remember = true): Document {
    if (!markdown.test(path)) throw new HttpError(400, 'Only .md, .markdown, and .mdown files can be edited.');
    const target = this.safePath(path);
    const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new HttpError(400, 'Choose a Markdown file.');
      if (stat.size > limit) throw new HttpError(413, 'This file exceeds the 2 MB editor limit.');
      const content = readFileSync(fd, 'utf8');
      if (content.includes('\0')) throw new HttpError(400, 'This file is not plain text.');
      if (remember) this.db.prepare('INSERT INTO recent VALUES (?, ?, ?) ON CONFLICT(root,path) DO UPDATE SET opened=excluded.opened').run(this.identity, path, new Date().toISOString());
      return { path, content, revision: revisionOf(content), modified: stat.mtime.toISOString() };
    } finally { closeSync(fd); }
  }
  save(path: string, content: string, revision: string) {
    if (Buffer.byteLength(content) > limit) throw new HttpError(413, 'Your document exceeds the 2 MB editor limit.');
    const current = this.read(path, false);
    if (current.revision !== revision) throw new HttpError(409, 'This file changed on disk. Download your draft, then load the latest version before saving.');
    const target = this.safePath(path);
    const temporary = join(dirname(target), `.markdown-editor-${randomUUID()}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(temporary, 'wx', lstatSync(target).mode & 0o777);
      fchmodSync(fd, lstatSync(target).mode & 0o777);
      writeFileSync(fd, content, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined;
      // Recheck immediately before replacing to catch changes during preparation.
      if (this.read(path, false).revision !== revision) throw new HttpError(409, 'This file changed on disk. Your draft has been kept.');
      renameSync(temporary, target);
      return this.read(path);
    } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temporary)) unlinkSync(temporary); }
  }
  create(path: string, kind: 'file' | 'directory') {
    if (!path || path.endsWith('/') || path.split('/').some(p => !p || /[\x00-\x1f<>:"|?*]/.test(p))) throw new HttpError(400, 'Enter a valid file or folder name.');
    if (kind === 'file' && !markdown.test(path)) throw new HttpError(400, 'Use a .md, .markdown, or .mdown filename.');
    const target = this.safePath(path, true);
    if (existsSync(target)) throw new HttpError(409, 'That name already exists.');
    if (kind === 'directory') { mkdirSync(target); return { path }; }
    writeFileSync(target, '', { flag: 'wx' });
    return this.read(path);
  }
  image(path: string) {
    const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const type = types[extname(path).toLowerCase()];
    if (!type) throw new HttpError(400, 'Only PNG, JPEG, GIF, and WebP images are supported.');
    const fd = openSync(this.safePath(path), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 10 * limit) throw new HttpError(413, 'Image is too large.'); return { type, data: readFileSync(fd) }; } finally { closeSync(fd); }
  }
  recent() { return this.db.prepare('SELECT path, opened FROM recent WHERE root=? ORDER BY opened DESC LIMIT 8').all(this.identity) as { path: string; opened: string }[]; }
}
