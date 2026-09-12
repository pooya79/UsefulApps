import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store, HttpError } from './database.js';
import { titleSchema } from '../shared/schema.js';
const idParams = z.object({ id: z.uuid() });
const projectInput = z.object({ title: titleSchema, description: z.string().max(2000).default(''), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#a5533b') }).strict();
export function createApp(store: Store, serveStatic = false) {
  const app = Fastify({ bodyLimit: 25 * 1024 * 1024, logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const status = err instanceof HttpError ? err.statusCode : typeof err === 'object' && err !== null && 'statusCode' in err ? Number(err.statusCode) : 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status || 500).send({ error: status < 500 && err instanceof Error ? err.message : 'Database operation failed; no changes were applied.' });
  });
  app.addHook('onRequest', async (req, reply) => {
    // Same-origin browser writes only; API remains usable by local command-line clients.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let host: string; try { host = new URL(req.headers.origin).host; } catch { return reply.code(403).send({ error: 'Invalid origin' }); }
      if (host !== req.headers.host) return reply.code(403).send({ error: 'Cross-origin writes are not allowed' });
    }
  });
  app.get('/health', async () => { store.db.prepare('SELECT 1').get(); return { status: 'ok' }; });
  app.get('/api/bootstrap', async () => store.library());
  app.get('/api/documents/:id', async req => store.getDocument(idParams.parse(req.params).id));
  app.post('/api/projects', async (req, reply) => reply.code(201).send(store.createProject(projectInput.parse(req.body))));
  app.patch('/api/projects/:id', async req => store.updateProject(idParams.parse(req.params).id, projectInput.parse(req.body)));
  app.post('/api/documents', async (req, reply) => { const b = z.object({ projectId: z.uuid(), title: titleSchema }).strict().parse(req.body); return reply.code(201).send(store.createDocument(b.projectId, b.title)); });
  app.patch('/api/documents/:id', async req => store.saveDocument(idParams.parse(req.params).id, z.object({ title: titleSchema, content: z.string().max(2_000_000), revision: z.number().int().positive() }).strict().parse(req.body)));
  for (const kind of ['projects', 'documents'] as const) {
    app.post(`/api/${kind}/reorder`, async req => { const b = z.object({ ids: z.array(z.uuid()), projectId: kind === 'documents' ? z.uuid() : z.uuid().optional() }).strict().parse(req.body); store.reorder(kind, b.ids, b.projectId); return store.library(); });
    for (const action of ['trash', 'restore'] as const) app.post(`/api/${kind}/:id/${action}`, async req => { store.trash(kind, idParams.parse(req.params).id, action === 'restore'); return store.library(); });
    app.delete(`/api/${kind}/:id`, async req => { store.purge(kind, idParams.parse(req.params).id); return store.library(); });
  }
  app.get('/api/search', async req => store.search(z.object({ q: z.string().max(500) }).parse(req.query).q));
  app.get('/api/export', async (_req, reply) => reply.header('Content-Disposition', `attachment; filename="ideavault-backup-${new Date().toISOString().slice(0, 10)}.json"`).header('Cache-Control', 'no-store').send(store.export()));
  app.post('/api/import/preview', async req => store.preview(req.body));
  app.post('/api/import/apply', async req => {
    const b = z.object({ backup: z.unknown(), mode: z.enum(['merge', 'replace']), token: z.string().length(64), resolutions: z.record(z.string(), z.enum(['local', 'imported'])), confirmReplace: z.boolean().optional() }).strict().parse(req.body);
    return store.apply({ ...b, backup: store.validate(b.backup) });
  });
  if (serveStatic && existsSync(resolve('dist'))) {
    app.register(fastifyStatic, { root: resolve('dist') });
    app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Endpoint not found' }) : reply.sendFile('index.html'));
  }
  return app;
}
