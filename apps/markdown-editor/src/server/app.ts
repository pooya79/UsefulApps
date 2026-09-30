import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join, resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { HttpError, Workspace } from './workspace.js';
const query = z.object({ path: z.string().max(4096) });
export function createApp(workspace: Workspace, serveStatic = false, displayRoot = workspace.identity, defaultWorkspace = '') {
  const app = Fastify({ bodyLimit: 3 * 1024 * 1024 });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues.map(i => i.message).join('; ') });
    const code = err instanceof HttpError ? err.statusCode : (err as { code?: string }).code;
    const parseStatus = (err as { statusCode?: number }).statusCode;
    const status = typeof code === 'number' ? code : code === 'EACCES' || code === 'EPERM' || code === 'EROFS' ? 403 : code === 'ENOENT' ? 404 : code === 'EEXIST' ? 409 : typeof parseStatus === 'number' && parseStatus >= 400 && parseStatus < 500 ? parseStatus : 500;
    reply.code(status).send({ error: status === 500 ? 'The file operation failed. Your draft is still in the editor.' : status === 403 && !(err instanceof HttpError) ? 'This folder is not writable. Check its host permissions.' : err instanceof Error ? err.message : 'File operation failed.' });
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
      if (req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ error: 'Cross-site access is not allowed.' });
      if (req.headers.origin) {
        let host; try { host = new URL(req.headers.origin).host; } catch { return reply.code(403).send({ error: 'Invalid origin.' }); }
        if (host !== req.headers.host) return reply.code(403).send({ error: 'Cross-origin access is not allowed.' });
      }
    }
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
  });
  const scope = (request: { query: unknown }) => workspace.at(z.object({ workspace: z.string().max(4096).default(defaultWorkspace) }).parse(request.query).workspace);
  app.get('/health', async () => { workspace.db.prepare('SELECT 1').get(); workspace.list(); return { status: 'ok' }; });
  app.get('/api/workspace', async req => {
    const selected = z.object({ workspace: z.string().max(4096).default(defaultWorkspace) }).parse(req.query).workspace;
    const view = workspace.at(selected);
    return { root: join(displayRoot, selected), browseRoot: displayRoot, workspace: selected, defaultWorkspace, recent: view.recent() };
  });
  app.get('/api/folders', async req => {
    const path = z.object({ path: z.string().max(4096).default('') }).parse(req.query).path;
    workspace.at(path);
    return { path, root: join(displayRoot, path), parent: path ? (dirname(path) === '.' ? '' : dirname(path)) : null, folders: workspace.list(path).filter(e => e.kind === 'directory') };
  });
  app.get('/api/files', async req => scope(req).list(z.object({ path: z.string().max(4096).default('') }).parse(req.query).path));
  app.get('/api/file', async req => scope(req).read(query.parse(req.query).path));
  app.put('/api/file', async req => { const b = z.object({ path: z.string().max(4096), content: z.string(), revision: z.string().length(64) }).strict().parse(req.body); return scope(req).save(b.path, b.content, b.revision); });
  app.post('/api/files', async (req, reply) => { const b = z.object({ path: z.string().max(4096), kind: z.enum(['file', 'directory']) }).strict().parse(req.body); return reply.code(201).send(scope(req).create(b.path, b.kind)); });
  app.get('/api/image', async (req, reply) => { const img = scope(req).image(query.parse(req.query).path); return reply.type(img.type).send(img.data); });
  if (serveStatic) {
    app.register(fastifyStatic, { root: resolve('dist') });
    app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Endpoint not found.' }) : reply.sendFile('index.html'));
  }
  return app;
}
