import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { backupSchema, type Backup, type Library, type Entity, type Project, type Document, type Tombstone, type ImportPreview, type ImportRequest } from '../shared/schema.js';

export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const now = () => new Date().toISOString();
const key = (e: Entity) => JSON.stringify(Object.fromEntries(Object.entries(e).sort(([a], [b]) => a.localeCompare(b))));
const map = (b: Library) => new Map([...b.projects, ...b.documents, ...b.tombstones].map(r => [r.id, r]));
const deleted = (e: Entity): e is Tombstone => 'deletedAt' in e;
const doc = (e: Entity): e is Document => 'projectId' in e;
const kind = (e: Entity) => deleted(e) ? e.kind : doc(e) ? 'document' : 'project';
export class Store {
  db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, accent TEXT NOT NULL, position INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, trashedAt TEXT);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, content TEXT NOT NULL, position INTEGER NOT NULL, revision INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, trashedAt TEXT);
      CREATE INDEX IF NOT EXISTS documents_project ON documents(projectId, position);
      CREATE TABLE IF NOT EXISTS tombstones (id TEXT PRIMARY KEY, kind TEXT NOT NULL, deletedAt TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(id UNINDEXED, title, content);
      CREATE TRIGGER IF NOT EXISTS document_insert AFTER INSERT ON documents BEGIN INSERT INTO document_search(id,title,content) VALUES(new.id,new.title,new.content); END;
      CREATE TRIGGER IF NOT EXISTS document_delete AFTER DELETE ON documents BEGIN DELETE FROM document_search WHERE id=old.id; END;
      CREATE TRIGGER IF NOT EXISTS document_update AFTER UPDATE OF title,content ON documents BEGIN DELETE FROM document_search WHERE id=old.id; INSERT INTO document_search(id,title,content) VALUES(new.id,new.title,new.content); END;
    `);
  }
  library(): Library { return { projects: this.db.prepare('SELECT * FROM projects ORDER BY position,id').all() as Project[], documents: this.db.prepare('SELECT * FROM documents ORDER BY position,id').all() as Document[], tombstones: this.db.prepare('SELECT * FROM tombstones ORDER BY id').all() as Tombstone[] }; }
  export(): Backup { return { format: 'ideavault', version: 1, exportedAt: now(), ...this.library() }; }
  token() { return createHash('sha256').update(JSON.stringify(this.library())).digest('hex'); }
  getProject(id: string) { const p = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as Project | undefined; if (!p) throw new HttpError(404, 'Project not found'); return p; }
  getDocument(id: string) { const d = this.db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Document | undefined; if (!d) throw new HttpError(404, 'Document not found'); return d; }
  activeProject(id: string) { const p = this.getProject(id); if (p.trashedAt) throw new HttpError(409, 'Restore the project first'); return p; }
  createProject(input: { title: string; description: string; accent: string }) {
    const stamp = now(); const p: Project = { ...input, id: randomUUID(), position: (this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM projects').get() as { n: number }).n, createdAt: stamp, updatedAt: stamp, trashedAt: null };
    this.insert('projects', p); return p;
  }
  updateProject(id: string, input: { title: string; description: string; accent: string }) { this.activeProject(id); this.db.prepare('UPDATE projects SET title=@title,description=@description,accent=@accent,updatedAt=@updatedAt WHERE id=@id').run({ ...input, id, updatedAt: now() }); return this.getProject(id); }
  createDocument(projectId: string, title: string) {
    this.activeProject(projectId); const stamp = now();
    const position = (this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM documents WHERE projectId=?').get(projectId) as { n: number }).n;
    const d: Document = { id: randomUUID(), projectId, title, content: '', position, revision: 1, createdAt: stamp, updatedAt: stamp, trashedAt: null }; this.insert('documents', d); return d;
  }
  saveDocument(id: string, input: { title: string; content: string; revision: number }) {
    return this.db.transaction(() => {
      const d = this.getDocument(id); this.activeProject(d.projectId); if (d.trashedAt) throw new HttpError(409, 'Restore the document before editing');
      const r = this.db.prepare('UPDATE documents SET title=@title,content=@content,revision=revision+1,updatedAt=@updatedAt WHERE id=@id AND revision=@revision').run({ ...input, id, updatedAt: now() });
      if (!r.changes) throw new HttpError(409, 'This document changed in another tab or import. Copy your draft, then load the latest version.');
      return this.getDocument(id);
    })();
  }
  reorder(kind: 'projects' | 'documents', ids: string[], projectId?: string) {
    this.db.transaction(() => {
      if (kind === 'documents') this.activeProject(projectId!);
      const rows = this.db.prepare(kind === 'projects' ? 'SELECT id FROM projects WHERE trashedAt IS NULL' : 'SELECT id FROM documents WHERE projectId=? AND trashedAt IS NULL').all(...(kind === 'documents' ? [projectId] : [])) as { id: string }[];
      if (ids.length !== rows.length || new Set(ids).size !== ids.length || rows.some(r => !ids.includes(r.id))) throw new HttpError(400, 'Reorder must contain every active item exactly once');
      const stmt = this.db.prepare(`UPDATE ${kind} SET position=?,updatedAt=? WHERE id=?`); ids.forEach((id, i) => stmt.run(i, now(), id));
    })();
  }
  trash(kind: 'projects' | 'documents', id: string, restore: boolean) {
    this.db.transaction(() => {
      const entity = kind === 'projects' ? this.getProject(id) : this.getDocument(id);
      if (restore && kind === 'documents') this.activeProject((entity as Document).projectId);
      this.db.prepare(`UPDATE ${kind} SET trashedAt=?,updatedAt=?${kind === 'documents' ? ',revision=revision+1' : ''} WHERE id=?`).run(restore ? null : now(), now(), id);
      // Children retain their individual trash state; a trashed parent hides its entire subtree.
      if (kind === 'projects') this.db.prepare('UPDATE documents SET revision=revision+1 WHERE projectId=?').run(id);
    })();
  }
  purge(kind: 'projects' | 'documents', id: string) {
    this.db.transaction(() => {
      const e = kind === 'projects' ? this.getProject(id) : this.getDocument(id);
      if (!e.trashedAt) throw new HttpError(409, 'Move this item to trash before deleting permanently');
      const add = this.db.prepare('INSERT INTO tombstones(id,kind,deletedAt) VALUES(?,?,?)');
      if (kind === 'projects') {
        const children = this.db.prepare('SELECT id FROM documents WHERE projectId=?').all(id) as { id: string }[];
        children.forEach(d => add.run(d.id, 'document', now())); this.db.prepare('DELETE FROM documents WHERE projectId=?').run(id);
      }
      this.db.prepare(`DELETE FROM ${kind} WHERE id=?`).run(id); add.run(id, kind === 'projects' ? 'project' : 'document', now());
    })();
  }
  search(query: string) {
    const terms = query.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replaceAll('"', '""')}"*`).join(' AND ');
    if (!terms) return [];
    return this.db.prepare(`SELECT d.* FROM document_search s JOIN documents d ON d.id=s.id JOIN projects p ON p.id=d.projectId WHERE document_search MATCH ? AND d.trashedAt IS NULL AND p.trashedAt IS NULL ORDER BY rank LIMIT 100`).all(terms) as Document[];
  }
  validate(value: unknown): Backup {
    if (typeof value === 'object' && value !== null && 'version' in value && value.version !== 1) throw new HttpError(400, `Unsupported backup version ${String(value.version)}. This installation supports version 1.`);
    const r = backupSchema.safeParse(value); if (!r.success) throw new HttpError(400, r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')); return r.data;
  }
  preview(value: unknown): ImportPreview {
    const b = this.validate(value); const local = map(this.library());
    const result: ImportPreview = { token: this.token(), additions: 0, unchanged: 0, deletions: 0, conflicts: [] };
    for (const imported of map(b).values()) {
      const l = local.get(imported.id);
      if (l && kind(l) !== kind(imported)) throw new HttpError(400, `ID ${imported.id} changes entity type`);
      if (!l) { if (deleted(imported)) result.deletions++; else result.additions++; }
      else if (key(l) === key(imported)) result.unchanged++;
      else { if (deleted(l) || deleted(imported)) result.deletions++; result.conflicts.push({ id: imported.id, label: 'title' in imported ? imported.title : 'title' in l ? l.title : imported.id, local: l, imported }); }
    }
    return result;
  }
  apply(input: ImportRequest) {
    return this.db.transaction(() => {
      const backup = this.validate(input.backup);
      if (this.token() !== input.token) throw new HttpError(409, 'The library changed after preview. Preview the file again.');
      const old = map(this.library()); let next: Library;
      if (input.mode === 'replace') {
        if (input.confirmReplace !== true) throw new HttpError(400, 'Confirm complete library replacement');
        next = backup;
      } else {
        const preview = this.preview(backup); const combined = new Map(old);
        for (const c of preview.conflicts) if (!['local', 'imported'].includes(input.resolutions[c.id])) throw new HttpError(400, `Choose local or imported for ${c.label}`);
        for (const e of map(backup).values()) if (!old.has(e.id) || input.resolutions[e.id] === 'imported') combined.set(e.id, e);
        next = { projects: [], documents: [], tombstones: [] };
        for (const e of combined.values()) { if (deleted(e)) next.tombstones.push(e); else if (doc(e)) next.documents.push(e); else next.projects.push(e); }
      }
      // A choice that deletes a parent but keeps a child is ambiguous: reject without altering the library.
      this.validate({ ...next, format: 'ideavault', version: 1, exportedAt: now() });
      next = { ...next, documents: next.documents.map(d => { const prev = old.get(d.id); return prev && doc(prev) && key(prev) !== key(d) ? { ...d, revision: Math.max(d.revision, prev.revision) + 1 } : d; }) };
      this.db.exec('DELETE FROM documents; DELETE FROM projects; DELETE FROM tombstones;');
      next.projects.forEach(p => this.insert('projects', p)); next.documents.forEach(d => this.insert('documents', d)); next.tombstones.forEach(t => this.insert('tombstones', t));
      return this.library();
    })();
  }
  private insert(table: 'projects' | 'documents' | 'tombstones', record: Entity) {
    const fields = Object.keys(record); this.db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(f => `@${f}`).join(',')})`).run(record);
  }
}
