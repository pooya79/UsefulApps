import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Store } from './database.js';
import { createApp } from './app.js';
import type { Backup, Document, Project } from '../shared/schema.js';
let store: Store; let app: ReturnType<typeof createApp>;
beforeEach(() => { store = new Store(':memory:'); app = createApp(store); });
afterEach(async () => { await app.close(); store.db.close(); });
const project = (title = 'Test project') => store.createProject({ title, description: 'Space to think', accent: '#50765d' });
const document = (p = project(), title = 'First thought') => store.createDocument(p.id, title);
const clone = <T>(b: T): T => structuredClone(b);
const apply = (backup: Backup, resolutions = {}, mode: 'merge' | 'replace' = 'merge', confirmReplace = false) => store.apply({ backup, token: store.preview(backup).token, mode, resolutions, confirmReplace });
const request = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as object });
describe('workspace API', () => {
  it('creates, renames and validates projects and documents', async () => {
    const r = await request('POST', '/api/projects', { title: 'Research' }); expect(r.statusCode).toBe(201);
    const p = r.json<Project>(); expect(p.description).toBe('');
    const update = await request('PATCH', `/api/projects/${p.id}`, { title: 'Research notes', description: 'Experiments', accent: '#53778d' }); expect(update.json().title).toBe('Research notes');
    const d = (await request('POST', '/api/documents', { projectId: p.id, title: 'Hypothesis' })).json<Document>();
    const saved = await request('PATCH', `/api/documents/${d.id}`, { title: 'New hypothesis', content: '# Test\n\nAn idea', revision: 1 }); expect(saved.json().revision).toBe(2);
    expect((await request('POST', '/api/projects', { title: ' ' })).statusCode).toBe(400);
    expect((await request('POST', '/api/documents', { title: 'Orphan', projectId: randomUUID() })).statusCode).toBe(404);
    expect((await app.inject('/api/bootstrap')).json().documents).toHaveLength(1);
  });
  it('rejects stale writes without losing the newer edit', async () => {
    const d = document(); store.saveDocument(d.id, { title: d.title, content: 'new', revision: 1 });
    const r = await request('PATCH', `/api/documents/${d.id}`, { title: d.title, content: 'stale', revision: 1 });
    expect(r.statusCode).toBe(409); expect(store.getDocument(d.id).content).toBe('new');
  });
  it('orders complete sets and rejects duplicate or cross-project IDs atomically', () => {
    const a = project('A'), b = project('B'); const d1 = document(a), d2 = document(a, 'Second'), other = document(b);
    store.reorder('projects', [b.id, a.id]); expect(store.library().projects[0].id).toBe(b.id);
    store.reorder('documents', [d2.id, d1.id], a.id); expect(store.library().documents.filter(d => d.projectId === a.id)[0].id).toBe(d2.id);
    const token = store.token(); expect(() => store.reorder('documents', [d1.id, other.id], a.id)).toThrow(); expect(() => store.reorder('projects', [a.id, a.id])).toThrow(); expect(store.token()).toBe(token);
  });
  it('searches title and content using FTS, excluding trashed records and parents', async () => {
    const p = project(); const d = document(p, 'Garden notes'); store.saveDocument(d.id, { title: d.title, content: 'Growing heirloom tomatoes', revision: 1 });
    expect(store.search('heirloom tom')).toHaveLength(1); expect(store.search('Garden')).toHaveLength(1); expect(store.search('" OR *')).toEqual([]);
    store.trash('projects', p.id, false); expect(store.search('tomatoes')).toEqual([]);
    store.trash('projects', p.id, true); expect(store.search('tomatoes')).toHaveLength(1);
    store.trash('documents', d.id, false); expect(store.search('Garden')).toEqual([]);
    expect((await app.inject('/api/search?q=Garden')).statusCode).toBe(200);
  });
  it('restores parents without reviving individually trashed children', () => {
    const p = project(); const a = document(p), b = document(p, 'Already trashed'); store.trash('documents', b.id, false); store.trash('projects', p.id, false);
    expect(() => store.createDocument(p.id, 'No')).toThrow('Restore'); expect(() => store.trash('documents', b.id, true)).toThrow('Restore');
    store.trash('projects', p.id, true); expect(store.getDocument(a.id).trashedAt).toBeNull(); expect(store.getDocument(b.id).trashedAt).not.toBeNull();
    store.trash('documents', b.id, true); expect(store.getDocument(b.id).trashedAt).toBeNull();
    expect(() => store.saveDocument(a.id, { title: a.title, content: 'old draft', revision: 1 })).toThrow('changed');
  });
  it('requires trash before purge and records cascade tombstones', () => {
    const p = project(); const d = document(p); expect(() => store.purge('projects', p.id)).toThrow('trash');
    store.trash('projects', p.id, false); store.purge('projects', p.id); expect(store.library().projects).toEqual([]); expect(store.library().documents).toEqual([]); expect(store.library().tombstones.map(t => t.id)).toEqual(expect.arrayContaining([p.id, d.id]));
  });
  it('handles document-only purge and endpoint restoration', async () => {
    const d = document(); expect((await request('POST', `/api/documents/${d.id}/trash`)).statusCode).toBe(200);
    expect((await request('POST', `/api/documents/${d.id}/restore`)).statusCode).toBe(200);
    await request('POST', `/api/documents/${d.id}/trash`); expect((await request('DELETE', `/api/documents/${d.id}`)).statusCode).toBe(200);
    expect(store.library().tombstones[0].kind).toBe('document');
  });
  it('blocks cross-origin browser writes', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/projects', headers: { origin: 'https://untrusted.example' }, payload: { title: 'No' } }); expect(r.statusCode).toBe(403);
  });
});
describe('portable backups and transactions', () => {
  it('exports active, trashed, and permanently deleted records and round-trips exactly into an empty store', async () => {
    const p = project(); const d = document(p); store.saveDocument(d.id, { title: 'Unicode ایده', content: '# Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done', revision: 1 });
    const discarded = document(p, 'Discard'); store.trash('documents', discarded.id, false); store.purge('documents', discarded.id); store.trash('projects', p.id, false);
    const response = await app.inject('/api/export'); expect(response.headers['content-disposition']).toContain('ideavault-backup-'); const b = response.json<Backup>();
    const other = new Store(':memory:'); try { other.apply({ backup: b, mode: 'merge', resolutions: {}, token: other.preview(b).token }); expect(other.library()).toEqual(store.library()); expect(other.preview(b).unchanged).toBe(3); } finally { other.db.close(); }
  });
  it('previews additions and identical records and requires each metadata/content choice', () => {
    const p = project(); const d = document(p); const b = clone(store.export()); b.projects[0].description = 'Remote description'; b.documents[0].content = 'Remote words';
    const newId = randomUUID(); b.documents.push({ ...b.documents[0], id: newId, title: 'Imported addition' }); const preview = store.preview(b);
    expect(preview.additions).toBe(1); expect(preview.conflicts).toHaveLength(2); const token = store.token(); expect(() => apply(b, { [d.id]: 'local' })).toThrow('Choose'); expect(store.token()).toBe(token);
    apply(b, { [p.id]: 'local', [d.id]: 'imported' }); expect(store.getProject(p.id).description).toBe(p.description); expect(store.getDocument(d.id).content).toBe('Remote words'); expect(store.getDocument(d.id).revision).toBe(2); expect(store.getDocument(newId).title).toBe('Imported addition');
  });
  it('never silently resurrects tombstoned records, but allows an explicit imported choice', () => {
    const d = document(); const old = store.export(); store.trash('documents', d.id, false); store.purge('documents', d.id);
    const preview = store.preview(old); expect(preview.deletions).toBe(1); expect(() => apply(old)).toThrow('Choose'); apply(old, { [d.id]: 'local' }); expect(store.library().documents).toEqual([]);
    apply(old, { [d.id]: 'imported' }); expect(store.getDocument(d.id).id).toBe(d.id); expect(store.library().tombstones).toEqual([]);
  });
  it('applies imported deletion choices and rejects orphan-producing parent decisions', () => {
    const p = project(); const d = document(p); const before = store.export(); store.trash('projects', p.id, false); store.purge('projects', p.id); const deletionBackup = store.export(); apply(before, {}, 'replace', true);
    const token = store.token(); expect(() => apply(deletionBackup, { [p.id]: 'imported', [d.id]: 'local' })).toThrow('missing project'); expect(store.token()).toBe(token);
    apply(deletionBackup, { [p.id]: 'imported', [d.id]: 'imported' }); expect(store.library().documents).toEqual([]); expect(store.library().projects).toEqual([]);
  });
  it('rejects malformed, duplicate, orphan, type-changing, and future backups before mutation', async () => {
    const p = project(); document(p); const b = store.export(), token = store.token();
    for (const bad of [{}, { ...b, version: 2 }, { ...b, projects: [...b.projects, b.projects[0]] }, { ...b, projects: [] }, { ...b, documents: [{ ...b.documents[0], revision: -1 }] }]) expect((await request('POST', '/api/import/preview', bad)).statusCode).toBe(400);
    const typeChanged = { ...b, projects: [], documents: [], tombstones: [{ id: p.id, kind: 'document' as const, deletedAt: b.exportedAt }] }; expect(() => store.preview(typeChanged)).toThrow('type'); expect(store.token()).toBe(token);
  });
  it('rejects library changes after preview and stale revisions after imported edits', () => {
    const d = document(); const b = store.export(); const preview = store.preview(b); store.saveDocument(d.id, { title: d.title, content: 'later', revision: 1 });
    expect(() => store.apply({ backup: b, mode: 'merge', resolutions: {}, token: preview.token })).toThrow('changed after preview');
    b.documents[0].content = 'Imported'; apply(b, { [d.id]: 'imported' }); expect(store.getDocument(d.id).revision).toBe(3);
    expect(() => store.saveDocument(d.id, { title: d.title, content: 'stale', revision: 2 })).toThrow('changed');
  });
  it('requires replace confirmation and replaces the complete library', async () => {
    document(); const replacement: Backup = { format: 'ideavault', version: 1, exportedAt: new Date().toISOString(), projects: [], documents: [], tombstones: [] };
    const token = store.token(); expect(() => apply(replacement, {}, 'replace')).toThrow('Confirm'); expect(store.token()).toBe(token);
    const r = await request('POST', '/api/import/apply', { backup: replacement, mode: 'replace', resolutions: {}, token, confirmReplace: true }); expect(r.statusCode).toBe(200); expect(store.library()).toEqual({ projects: [], documents: [], tombstones: [] });
  });
  it('rolls back all changes and the search index when an insertion fails mid-import', () => {
    const d = document(); const b = store.export(); b.documents[0].content = 'Failure'; const token = store.token();
    store.db.exec("CREATE TRIGGER simulate_failure BEFORE INSERT ON documents WHEN new.content='Failure' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
    expect(() => apply(b, { [d.id]: 'imported' })).toThrow('simulated'); expect(store.token()).toBe(token); expect(store.search('First')).toHaveLength(1);
  });
});
