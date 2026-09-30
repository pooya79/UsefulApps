export type Entry = { name: string; path: string; kind: 'directory' | 'file' };
export type Document = { path: string; content: string; revision: string; modified: string };
export type WorkspaceInfo = { root: string; browseRoot: string; workspace: string; defaultWorkspace: string; recent: { path: string }[] };
export type FolderListing = { path: string; root: string; parent: string | null; folders: Entry[] };
