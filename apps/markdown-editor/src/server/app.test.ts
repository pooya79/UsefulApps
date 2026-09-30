import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from './workspace.js';
import { createApp } from './app.js';
describe('local Markdown workspace', () => {
  let temporary: string, root: string, store: Workspace, app: ReturnType<typeof createApp>;
  beforeEach(() => {
    temporary = mkdtempSync(join(tmpdir(), 'markdown-editor-')); root = join(temporary, 'files'); mkdirSync(root);
    writeFileSync(join(root, 'hello.md'), '# Hello\n'); mkdirSync(join(root, 'notes'));
    store = new Workspace(root); app = createApp(store);
  });
  afterEach(async () => { await app.close(); store.db.close(); rmSync(temporary, { recursive: true, force: true }); });
  const get = (path: string) => `/api/file?path=${encodeURIComponent(path)}`;
  it('lists Markdown and folders, excluding private files, builds and symlinks', async () => {
    writeFileSync(join(root, '.private.md'), 'secret'); writeFileSync(join(root, 'text.txt'), 'not markdown');
    mkdirSync(join(root, 'node_modules')); symlinkSync(join(root, 'hello.md'), join(root, 'linked.md'));
    const entries = (await app.inject('/api/files')).json();
    expect(entries.map((e: { name: string }) => e.name)).toEqual(['notes', 'hello.md']);
  });
  it('saves Persian text to disk and returns a new revision', async () => {
    const doc = (await app.inject(get('hello.md'))).json();
    const saved = await app.inject({ method: 'PUT', url: '/api/file', payload: { path: doc.path, revision: doc.revision, content: '# یادداشت\nسلام دنیا' } });
    expect(saved.statusCode).toBe(200); expect(saved.json().revision).not.toBe(doc.revision);
    expect(readFileSync(join(root, 'hello.md'), 'utf8')).toBe('# یادداشت\nسلام دنیا');
    expect((await app.inject('/api/workspace')).json().recent[0].path).toBe('hello.md');
  });
  it('rejects stale saves and preserves an external edit', async () => {
    const doc = (await app.inject(get('hello.md'))).json(); writeFileSync(join(root, 'hello.md'), 'External change');
    const result = await app.inject({ method: 'PUT', url: '/api/file', payload: { path: doc.path, revision: doc.revision, content: 'Old tab' } });
    expect(result.statusCode).toBe(409); expect(readFileSync(join(root, 'hello.md'), 'utf8')).toBe('External change');
  });
  it('prevents two browser tabs overwriting one another', async () => {
    const doc = (await app.inject(get('hello.md'))).json();
    const payload = { path: doc.path, revision: doc.revision, content: 'Tab one' };
    expect((await app.inject({ method: 'PUT', url: '/api/file', payload })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: '/api/file', payload: { ...payload, content: 'Tab two' } })).statusCode).toBe(409);
  });
  it.each(['../outside.md', '/etc/passwd.md', '.private.md', 'notes/../../outside.md', 'notes\\outside.md'])('blocks unsafe path %s', async path => {
    expect((await app.inject(get(path))).statusCode).toBeGreaterThanOrEqual(400);
  });
  it('rejects symlinked directories and files, including dangling links', async () => {
    symlinkSync(temporary, join(root, 'escape')); symlinkSync(join(root, 'hello.md'), join(root, 'alias.md'));
    symlinkSync(join(temporary, 'missing'), join(root, 'missing.md'));
    expect((await app.inject(get('alias.md'))).statusCode).toBe(403);
    expect((await app.inject('/api/files?path=escape')).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/files', payload: { path: 'missing.md', kind: 'file' } })).statusCode).toBeGreaterThanOrEqual(400);
  });
  it('creates nested Persian Markdown files and refuses to overwrite an existing file', async () => {
    const payload = { path: 'notes/سلام.md', kind: 'file' };
    expect((await app.inject({ method: 'POST', url: '/api/files', payload })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/files', payload })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/files', payload: { path: 'notes/new', kind: 'directory' } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/files', payload: { path: 'bad.txt', kind: 'file' } })).statusCode).toBe(400);
  });
  it('limits large and binary Markdown files', async () => {
    writeFileSync(join(root, 'large.md'), 'a'.repeat(2 * 1024 * 1024 + 1)); writeFileSync(join(root, 'binary.md'), 'a\0b');
    expect((await app.inject(get('large.md'))).statusCode).toBe(413);
    expect((await app.inject(get('binary.md'))).statusCode).toBe(400);
    expect((await app.inject(get('notes'))).statusCode).toBe(400);
  });
  it('rejects cross-origin reads and writes', async () => {
    expect((await app.inject({ url: get('hello.md'), headers: { origin: 'https://untrusted.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/files', headers: { 'sec-fetch-site': 'cross-site' }, payload: { path: 'evil.md', kind: 'file' } })).statusCode).toBe(403);
    expect((await app.inject({ url: get('hello.md'), headers: { host: 'localhost:3004', origin: 'http://localhost:3004' } })).statusCode).toBe(200);
  });
  it('serves supported local image formats while refusing SVG and arbitrary files', async () => {
    writeFileSync(join(root, 'pixel.png'), Buffer.from([137, 80, 78, 71]));
    const image = await app.inject('/api/image?path=pixel.png'); expect(image.statusCode).toBe(200); expect(image.headers['content-type']).toBe('image/png');
    writeFileSync(join(root, 'unsafe.svg'), '<svg/>'); expect((await app.inject('/api/image?path=unsafe.svg')).statusCode).toBe(400);
    expect((await app.inject('/api/image?path=hello.md')).statusCode).toBe(400);
  });
  it('persists recent history in SQLite and isolates workspaces', () => {
    const database = join(temporary, 'history.db'); let persistent = new Workspace(root, database);
    persistent.read('hello.md'); persistent.db.close(); persistent = new Workspace(root, database);
    expect(persistent.recent()[0].path).toBe('hello.md'); persistent.db.close();
    const other = new Workspace(temporary, database); expect(other.recent()).toEqual([]); other.db.close();
  });
  it('scopes recent history to host folder identities even when the container mount path is identical', () => {
    const database = join(temporary, 'identities.db');
    const first = new Workspace(root, database, '/home/user/first'); first.read('hello.md'); first.db.close();
    const second = new Workspace(root, database, '/home/user/second'); expect(second.recent()).toEqual([]); second.db.close();
    const original = new Workspace(root, database, '/home/user/first'); expect(original.recent()[0].path).toBe('hello.md'); original.db.close();
  });
  it('browses only eligible folders with bounded parent navigation', async () => {
    mkdirSync(join(root, '.hidden')); symlinkSync(temporary, join(root, 'escape'));
    const listing = (await app.inject('/api/folders')).json();
    expect(listing.parent).toBeNull(); expect(listing.folders.map((e: { name: string }) => e.name)).toEqual(['notes']);
    expect((await app.inject('/api/folders?path=notes')).json().parent).toBe('');
    expect((await app.inject('/api/folders?path=hello.md')).statusCode).toBe(400);
    expect((await app.inject('/api/folders?path=../')).statusCode).toBe(400);
    expect((await app.inject('/api/folders?path=escape')).statusCode).toBe(403);
  });
  it('selects scoped workspaces without changing another tab or the default workspace', async () => {
    writeFileSync(join(root, 'notes', 'hello.md'), '# Other folder');
    const info = (await app.inject('/api/workspace?workspace=notes')).json();
    expect(info.root).toBe(join(root, 'notes')); expect(info.workspace).toBe('notes');
    expect((await app.inject('/api/file?workspace=notes&path=hello.md')).json().content).toBe('# Other folder');
    expect((await app.inject('/api/file?path=hello.md')).json().content).toBe('# Hello\n');
    expect((await app.inject('/api/workspace')).json().workspace).toBe('');
  });
  it('keeps saves and history in their requested workspace even after another folder is selected', async () => {
    writeFileSync(join(root, 'notes', 'hello.md'), '# Hello\n');
    const original = (await app.inject(get('hello.md'))).json();
    await app.inject('/api/workspace?workspace=notes');
    const payload = { path: original.path, revision: original.revision, content: '# Original tab edit' };
    expect((await app.inject({ method: 'PUT', url: '/api/file?workspace=', payload })).statusCode).toBe(200);
    expect(readFileSync(join(root, 'notes', 'hello.md'), 'utf8')).toBe('# Hello\n');
    expect((await app.inject('/api/workspace?workspace=notes')).json().recent).toEqual([]);
    expect((await app.inject('/api/workspace')).json().recent[0].path).toBe('hello.md');
  });
  it('confines edits and local images to the selected folder', async () => {
    expect((await app.inject('/api/file?workspace=notes&path=../hello.md')).statusCode).toBe(400);
    expect((await app.inject('/api/workspace?workspace=../outside')).statusCode).toBe(400);
    expect((await app.inject('/api/workspace?workspace=removed')).statusCode).toBe(404);
    const created = await app.inject({ method: 'POST', url: '/api/files?workspace=notes', payload: { path: 'new.md', kind: 'file' } });
    expect(created.statusCode).toBe(201); expect(readFileSync(join(root, 'notes', 'new.md'), 'utf8')).toBe('');
    writeFileSync(join(root, 'notes', 'pixel.png'), Buffer.from([137, 80, 78, 71]));
    expect((await app.inject('/api/image?workspace=notes&path=pixel.png')).statusCode).toBe(200);
    expect((await app.inject('/api/image?workspace=&path=pixel.png')).statusCode).toBe(404);
  });
  it('uses the configured starting workspace when no scope is supplied', async () => {
    await app.close(); app = createApp(store, false, root, 'notes');
    expect((await app.inject('/api/workspace')).json().workspace).toBe('notes');
    expect((await app.inject('/api/files')).json()).toEqual([]);
    expect((await app.inject('/api/files?workspace=')).json().some((e: { name: string }) => e.name === 'hello.md')).toBe(true);
  });
  it('validates API payloads and reports health', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/file', payload: { path: 'hello.md' } })).statusCode).toBe(400);
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject(get('removed.md'))).statusCode).toBe(404);
  });
});
