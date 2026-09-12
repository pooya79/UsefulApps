import { z } from 'zod';
export const titleSchema = z.string().trim().min(1).max(200);
const timestamp = z.iso.datetime();
const base = { id: z.uuid(), title: titleSchema, position: z.number().int().nonnegative(), createdAt: timestamp, updatedAt: timestamp, trashedAt: timestamp.nullable() };
export const projectSchema = z.object({ ...base, description: z.string().max(2000), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
export const documentSchema = z.object({ ...base, projectId: z.uuid(), content: z.string().max(2_000_000), revision: z.number().int().positive() }).strict();
export const tombstoneSchema = z.object({ id: z.uuid(), kind: z.enum(['project', 'document']), deletedAt: timestamp }).strict();
export const backupSchema = z.object({ format: z.literal('ideavault'), version: z.literal(1), exportedAt: timestamp, projects: z.array(projectSchema).max(10000), documents: z.array(documentSchema).max(100000), tombstones: z.array(tombstoneSchema).max(200000) }).strict().superRefine((b, ctx) => {
  const ids = new Set<string>();
  for (const r of [...b.projects, ...b.documents, ...b.tombstones]) {
    if (ids.has(r.id)) ctx.addIssue({ code: 'custom', message: `Duplicate or active/deleted ID: ${r.id}` });
    ids.add(r.id);
  }
  const projects = new Set(b.projects.map(p => p.id));
  for (const d of b.documents) if (!projects.has(d.projectId)) ctx.addIssue({ code: 'custom', message: `Document ${d.title} references missing project ${d.projectId}` });
});
export type Project = z.infer<typeof projectSchema>;
export type Document = z.infer<typeof documentSchema>;
export type Tombstone = z.infer<typeof tombstoneSchema>;
export type Backup = z.infer<typeof backupSchema>;
export type Library = Pick<Backup, 'projects' | 'documents' | 'tombstones'>;
export type Entity = Project | Document | Tombstone;
export type Conflict = { id: string; label: string; local: Entity; imported: Entity };
export type ImportPreview = { token: string; additions: number; unchanged: number; deletions: number; conflicts: Conflict[] };
export type ImportRequest = { backup: Backup; mode: 'merge' | 'replace'; token: string; resolutions: Record<string, 'local' | 'imported'>; confirmReplace?: boolean };
