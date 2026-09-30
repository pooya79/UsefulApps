import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, Bold, Check, ChevronDown, ChevronRight, Code2, Columns3, Eye, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Heading1, Italic, Link2, List, Moon, PanelLeft, RefreshCw, Save, Search, Settings2, Sun, WrapText, X } from 'lucide-react';
import type { Document, Entry, WorkspaceInfo } from '../shared/types';
import { api, ApiError } from './api';
import { WorkspacePicker } from './WorkspacePicker';
import { Markdown } from './Markdown';
import { editIndent } from './editorIndent';
type Pane = 'files' | 'edit' | 'preview';
type Preferences = { panes: Record<Pane, boolean>; widths: Record<Pane, number>; auto: boolean; direction: 'auto' | 'ltr' | 'rtl'; dark: boolean; wrap: boolean };
const defaults: Preferences = { panes: { files: true, edit: true, preview: true }, widths: { files: 240, edit: 550, preview: 550 }, auto: true, direction: 'auto', dark: false, wrap: true };
function preferences(): Preferences {
  try {
    const v = JSON.parse(localStorage.getItem('markdown-editor-settings') || 'null');
    if (!v || !['auto', 'rtl', 'ltr'].includes(v.direction)) return defaults;
    return { ...defaults, auto: typeof v.auto === 'boolean' ? v.auto : true, dark: !!v.dark, wrap: v.wrap !== false, direction: v.direction,
      panes: Object.fromEntries((['files', 'edit', 'preview'] as Pane[]).map(p => [p, typeof v.panes?.[p] === 'boolean' ? v.panes[p] : true])) as Preferences['panes'],
      widths: Object.fromEntries((['files', 'edit', 'preview'] as Pane[]).map(p => [p, Number.isFinite(v.widths?.[p]) ? Math.min(1800, Math.max(180, v.widths[p])) : defaults.widths[p]])) as Preferences['widths'] };
  } catch { return defaults; }
}
export function App() {
  const [prefs, setPrefs] = useState(preferences);
  const [root, setRoot] = useState('');
  const [browseRoot, setBrowseRoot] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const scopeRef = useRef('');
  const scoped = (url: string) => `${url}${url.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(scopeRef.current)}`;
  const [tree, setTree] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState('');
  const [filter, setFilter] = useState('');
  const [recent, setRecent] = useState<{ path: string }[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const current = useRef<{ doc: Document; saved: string } | null>(null);
  const flight = useRef<Promise<void> | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<'file' | 'directory' | 'reload' | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const dialogInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const visible = (['files', 'edit', 'preview'] as Pane[]).filter(p => prefs.panes[p]);
  useEffect(() => { document.documentElement.dataset.theme = prefs.dark ? 'dark' : 'light'; try { localStorage.setItem('markdown-editor-settings', JSON.stringify(prefs)); } catch { /* Private browser storage may be disabled. */ } }, [prefs]);
  const loadFolder = useCallback(async (path: string) => {
    const scope = scopeRef.current;
    const entries = await api<Entry[]>(`files?path=${encodeURIComponent(path)}&workspace=${encodeURIComponent(scope)}`);
    if (scope !== scopeRef.current) return;
    setTree(t => ({ ...t, [path]: entries }));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let info = await api<WorkspaceInfo>('workspace');
      let entries: Entry[] | undefined;
      try {
        const remembered = localStorage.getItem(`markdown-editor-workspace:${info.browseRoot}`);
        if (remembered !== null) {
          const restored = await api<WorkspaceInfo>(`workspace?workspace=${encodeURIComponent(remembered)}`);
          const files = await api<Entry[]>(`files?workspace=${encodeURIComponent(restored.workspace)}`);
          info = restored; entries = files;
        }
      } catch { /* A removed folder falls back to the configured starting workspace. */ }
      entries ||= await api<Entry[]>(`files?workspace=${encodeURIComponent(info.workspace)}`);
      if (cancelled) return;
      scopeRef.current = info.workspace; setSelectedWorkspace(info.workspace); setBrowseRoot(info.browseRoot);
      setRoot(info.root); setRecent(info.recent); setTree({ '': entries });
    };
    void start().catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current && current.current.doc.content !== current.current.saved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    if (modal) { lastFocus.current = document.activeElement as HTMLElement; dialog.current?.showModal(); dialogInput.current?.focus(); }
    else { dialog.current?.close(); lastFocus.current?.focus(); }
  }, [modal]);
  const save = useCallback(async () => {
    if (flight.current) return flight.current;
    const run = async () => {
      while (current.current && current.current.doc.content !== current.current.saved) {
        const snapshot = { ...current.current.doc };
        setStatus('Saving…');
        try {
          const saved = await api<Document>(scoped('file'), { path: snapshot.path, content: snapshot.content, revision: snapshot.revision }, 'PUT');
          if (current.current?.doc.path === snapshot.path) {
            current.current = { doc: { ...saved, content: current.current.doc.content }, saved: snapshot.content };
            setDoc(current.current.doc); setDirty(current.current.doc.content !== snapshot.content);
          }
          setSaveError(''); setConflict(false); setStatus('Saved');
        } catch (e) {
          const err = e as ApiError; setSaveError(err.message); setConflict(err.status === 409); setStatus('Not saved'); throw e;
        }
      }
    };
    flight.current = run();
    try { await flight.current; } finally { flight.current = null; }
  }, []);
  useEffect(() => {
    if (!prefs.auto || !dirty || busy || saveError) return;
    const timer = setTimeout(() => { void save().catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [doc?.content, prefs.auto, dirty, busy, saveError, save]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!busyRef.current) void save().catch(() => {}); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [save]);
  const open = async (path: string) => {
    if (busyRef.current || path === current.current?.doc.path) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await save();
      const next = await api<Document>(scoped(`file?path=${encodeURIComponent(path)}`));
      current.current = { doc: next, saved: next.content }; setDoc(next); setDirty(false); setSaveError(''); setConflict(false); setStatus('Saved'); setPosition({ line: 1, column: 1 });
      const parent = path.split('/').slice(0, -1).join('/'); setFolder(parent);
      const ancestors = path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));
      setExpanded(prev => new Set([...prev, ...ancestors]));
      void Promise.all(ancestors.map(loadFolder)).catch(e => setError(e.message));
      setRecent(prev => [{ path }, ...prev.filter(r => r.path !== path)].slice(0, 8));
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const changeWorkspace = async (path: string) => {
    if (busyRef.current) throw new Error('Wait for the current file operation to finish.');
    if (path === scopeRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await save();
      const [info, entries] = await Promise.all([
        api<WorkspaceInfo>(`workspace?workspace=${encodeURIComponent(path)}`),
        api<Entry[]>(`files?workspace=${encodeURIComponent(path)}`)
      ]);
      scopeRef.current = info.workspace; setSelectedWorkspace(info.workspace); setRoot(info.root); setRecent(info.recent);
      current.current = null; setDoc(null); setDirty(false); setFolder(''); setExpanded(new Set()); setFilter('');
      setTree({ '': entries }); setError(''); setSaveError(''); setConflict(false); setStatus('Ready'); setPosition({ line: 1, column: 1 });
      try { localStorage.setItem(`markdown-editor-workspace:${browseRoot}`, info.workspace); } catch { /* Storage may be unavailable. */ }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const edit = (content: string) => {
    if (!current.current) return;
    current.current = { ...current.current, doc: { ...current.current.doc, content } };
    setDoc(current.current.doc); const changed = content !== current.current.saved; setDirty(changed); setStatus(changed ? 'Unsaved changes' : 'Saved');
    if (!conflict) setSaveError('');
  };
  const refresh = async () => {
    setError('');
    try { await Promise.all(['', ...expanded].map(loadFolder)); } catch (e) { setError((e as Error).message); }
  };
  const toggleFolder = async (path: string) => {
    setFolder(path);
    if (expanded.has(path)) setExpanded(prev => { const next = new Set(prev); next.delete(path); return next; });
    else { try { await loadFolder(path); setExpanded(prev => new Set([...prev, path])); } catch (e) { setError((e as Error).message); } }
  };
  const newItem = (kind: 'file' | 'directory') => { if (!root || busyRef.current) return; setModalError(''); setName(''); setModal(kind); };
  const create = async () => {
    if (modal !== 'file' && modal !== 'directory') return;
    const path = folder ? `${folder}/${name.trim()}` : name.trim();
    setCreating(true); setModalError('');
    try {
      if (modal === 'file') await save();
      const item = await api<Document | { path: string }>(scoped('files'), { path, kind: modal });
      await loadFolder(folder); setExpanded(prev => new Set([...prev, folder]));
      setModal(null);
      if ('content' in item) await open(item.path);
    } catch (e) { setModalError((e as Error).message); }
    finally { setCreating(false); }
  };
  const reload = async () => {
    if (!doc) return;
    setCreating(true); setModalError('');
    try { const next = await api<Document>(scoped(`file?path=${encodeURIComponent(doc.path)}`)); current.current = { doc: next, saved: next.content }; setDoc(next); setDirty(false); setSaveError(''); setError(''); setConflict(false); setStatus('Saved'); setModal(null); }
    catch (e) { setModalError((e as Error).message); } finally { setCreating(false); }
  };
  const download = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = doc.path.split('/').pop() || 'draft.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const format = (before: string, after = '', placeholder = 'text') => {
    const el = textarea.current; if (!el || !doc) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const selection = doc.content.slice(start, end) || placeholder;
    edit(doc.content.slice(0, start) + before + selection + after + doc.content.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + selection.length); });
  };
  const locate = () => { const el = textarea.current; if (!el) return; const preceding = el.value.slice(0, el.selectionStart).split('\n'); setPosition({ line: preceding.length, column: preceding.at(-1)!.length + 1 }); };
  const togglePane = (p: Pane) => setPrefs(v => ({ ...v, panes: { ...v.panes, [p]: !v.panes[p] } }));
  const resize = (left: Pane, right: Pane, change: number, initial?: Preferences['widths']) => {
    setPrefs(v => {
      const sizes = initial || v.widths;
      const total = sizes[left] + sizes[right];
      const minLeft = left === 'files' ? 180 : 280, minRight = 280;
      const width = Math.max(minLeft, Math.min(total - minRight, sizes[left] + change));
      return { ...v, widths: { ...sizes, [left]: width, [right]: total - width } };
    });
  };
  const startResize = (event: ReactPointerEvent<HTMLDivElement>, left: Pane, right: Pane) => {
    event.preventDefault(); const handle = event.currentTarget; handle.setPointerCapture(event.pointerId);
    const paneLeft = workspace.current?.querySelector<HTMLElement>(`[data-pane="${left}"]`), paneRight = workspace.current?.querySelector<HTMLElement>(`[data-pane="${right}"]`);
    const initial = { ...prefs.widths, [left]: paneLeft?.getBoundingClientRect().width || prefs.widths[left], [right]: paneRight?.getBoundingClientRect().width || prefs.widths[right] };
    const start = event.clientX;
    const move = (e: PointerEvent) => resize(left, right, e.clientX - start, initial);
    const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
  };
  const renderTree = (path: string, depth = 0) => (tree[path] || []).map(entry => {
    const isFolder = entry.kind === 'directory', isOpen = expanded.has(entry.path);
    const matches = !filter || entry.name.toLowerCase().includes(filter.toLowerCase());
    if (!isFolder && !matches) return null;
    return <div key={entry.path}>
      <button className={`tree-item ${doc?.path === entry.path ? 'active' : ''} ${isFolder && folder === entry.path ? 'selected-folder' : ''}`} style={{ paddingInlineStart: 14 + depth * 16 }} title={entry.path} disabled={busy} onClick={() => isFolder ? void toggleFolder(entry.path) : void open(entry.path)}>
        {isFolder ? <>{isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} {isOpen ? <FolderOpen size={16}/> : <Folder size={16}/>}</> : <><span className="tree-indent"/><FileText size={16}/></>}
        <span dir="auto">{entry.name}</span>{doc?.path === entry.path && dirty && <i className="dot"/>}
      </button>
      {isFolder && isOpen && renderTree(entry.path, depth + 1)}
      {isFolder && isOpen && tree[entry.path]?.length === 0 && <small className="folder-empty" style={{ paddingLeft: 46 + depth * 16 }}>No Markdown files</small>}
    </div>;
  });
  const fileName = doc?.path.split('/').pop();
  const words = doc?.content.trim() ? doc.content.trim().split(/\s+/u).length : 0;
  const direction = prefs.direction === 'auto' ? (/^[^\p{L}]*[\u0600-\u06ff]/u.test(doc?.content || '') ? 'rtl' : 'ltr') : prefs.direction;
  const paneHeader = (p: Pane, icon: React.ReactNode, label: string, detail: string) => <div className="pane-header"><span>{icon}{label}</span><small>{detail}</small><button className="icon-button" title={`Close ${label.toLowerCase()} pane`} aria-label={`Close ${label.toLowerCase()} pane`} onClick={() => togglePane(p)}><X size={15}/></button></div>;
  return <div className="app">
    <header className="topbar"><a className="brand" href="/" onClick={e => e.preventDefault()}><span className="brand-mark"><FileText size={23}/></span><span>Markdown<span className="brand-light"> Editor</span><small>A little space for your words.</small></span></a>
      <div className="top-actions"><button className="secondary-button change-workspace-button" aria-label="Change workspace" title="Change workspace" disabled={busy || creating || !root} onClick={() => setPickerOpen(true)}><FolderOpen size={16}/><span>Change workspace</span></button><span className="local-badge"><i/>Local workspace</span><button className="icon-button theme-button" title={prefs.dark ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={prefs.dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setPrefs(v => ({ ...v, dark: !v.dark }))}>{prefs.dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="primary-button" disabled={!root || busy || creating} onClick={() => newItem('file')}><FilePlus2 size={16}/>New file</button></div>
    </header>
    <div className="workspace-bar"><div className="document-label"><FileText size={17}/><span dir="auto">{fileName || 'Your workspace'}</span>{dirty && <i className="dot"/>}<span className="document-parent" title={doc?.path}>{doc?.path.includes('/') ? doc.path.split('/').slice(0, -1).join(' / ') : 'Markdown, made simple.'}</span></div>
      <div className="view-controls"><div className="pane-toggles" aria-label="Visible panes">{(['files', 'edit', 'preview'] as Pane[]).map((p, i) => <button key={p} aria-pressed={prefs.panes[p]} title={`Toggle ${p} pane`} onClick={() => togglePane(p)}>{i === 0 ? <PanelLeft size={15}/> : i === 1 ? <Code2 size={15}/> : <Eye size={15}/>}<span>{p === 'edit' ? 'Editor' : p === 'files' ? 'Files' : 'Preview'}</span></button>)}</div><button className="icon-button" title="Reset pane layout" aria-label="Reset pane layout" onClick={() => setPrefs(v => ({ ...v, panes: defaults.panes, widths: defaults.widths }))}><Columns3 size={18}/></button></div>
    </div>
    {(error || saveError) && <div className="error-banner" role="alert"><span>{saveError || error}</span>{doc && <button onClick={download}><ArrowDownToLine size={14}/>Download draft</button>}{doc && <button onClick={() => { setModalError(''); setModal('reload'); }}>Load latest</button>}<button className="icon-button" aria-label="Dismiss error" onClick={() => { setError(''); if (!conflict) setSaveError(''); }}><X size={16}/></button></div>}
    <div className="workspace-scroll"><main ref={workspace} className="workspace" aria-label="Markdown workspace">
      {visible.map((p, i) => <div className="pane-group" key={p} style={{ flex: p === 'files' && visible.length > 1 ? `0 0 ${prefs.widths.files}px` : `${prefs.widths[p]} 1 0`, minWidth: p === 'files' ? 180 : 280 }}>
        <section className={`pane ${p}-pane`} data-pane={p} aria-label={`${p} pane`}>
          {p === 'files' && <>{paneHeader(p, <FolderOpen size={16}/>, 'Files', '.md')}<div className="file-tools"><label className="search"><Search size={15}/><input placeholder="Filter visible files…" aria-label="Filter visible files" value={filter} onChange={e => setFilter(e.target.value)}/></label><div className="folder-toolbar"><button className="workspace-root" title={root} onClick={() => setFolder('')}><Folder size={14}/>{root.split('/').pop() || 'Workspace'}</button><button className="icon-button" title="New folder" aria-label="New folder" onClick={() => newItem('directory')}><FolderPlus size={16}/></button><button className="icon-button" title="Refresh files" aria-label="Refresh files" onClick={() => void refresh()}><RefreshCw size={15}/></button></div></div><nav className="file-tree" aria-label="Markdown files">{renderTree('')}{tree['']?.length === 0 && <p className="muted-note">No Markdown files yet.<br/>Create one to get started.</p>}</nav>{recent.length > 0 && <div className="recent"><h3>RECENTLY OPENED</h3>{recent.slice(0, 4).map(r => <button key={r.path} title={r.path} disabled={busy} onClick={() => void open(r.path)}><FileText size={14}/><span dir="auto">{r.path.split('/').pop()}</span></button>)}</div>}<div className="workspace-info"><span><i/>CONNECTED FOLDER</span><code title={root}>{root || 'Connecting…'}</code><small>Files stay on your computer.</small><button className="text-button" disabled={busy || creating} onClick={() => setPickerOpen(true)}><FolderOpen size={14}/>Change workspace</button></div></>}
          {p === 'edit' && <>{paneHeader(p, <Code2 size={16}/>, 'Editor', 'MARKDOWN')}<div className="format-toolbar"><div>{[[Heading1, '# ', '', 'Heading'], [Bold, '**', '**', 'Bold'], [Italic, '_', '_', 'Italic'], [Link2, '[', '](https://example.com)', 'Link'], [List, '- ', '', 'List'], [Code2, '`', '`', 'Code']] .map(([Icon, before, after, label]) => { const I = Icon as typeof Bold; return <button key={String(label)} className="icon-button" title={String(label)} aria-label={String(label)} disabled={!doc || busy} onClick={() => format(String(before), String(after))}><I size={16}/></button>; })}</div><button className={`icon-button ${prefs.wrap ? 'enabled' : ''}`} title="Toggle line wrapping" aria-label="Toggle line wrapping" aria-pressed={prefs.wrap} onClick={() => setPrefs(v => ({ ...v, wrap: !v.wrap }))}><WrapText size={17}/></button></div>{doc ? <div className={`source ${prefs.wrap ? 'wrapped' : ''}`}><div ref={lines} className="line-numbers" aria-hidden="true">{doc.content.split('\n').map((_, n) => <div key={n}>{n + 1}</div>)}</div><textarea ref={textarea} aria-label="Markdown source" spellCheck={false} dir={prefs.direction} value={doc.content} disabled={busy || creating} placeholder="Start with a thought…" wrap={prefs.wrap ? 'soft' : 'off'} onChange={e => edit(e.target.value)} onSelect={locate} onScroll={e => { if (lines.current) lines.current.scrollTop = e.currentTarget.scrollTop; }} onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); const el = e.currentTarget; const next = editIndent(doc.content, el.selectionStart, el.selectionEnd, e.shiftKey); edit(next.content); requestAnimationFrame(() => { el.setSelectionRange(next.selectionStart, next.selectionEnd); locate(); }); } }}/></div> : <div className="pane-placeholder"><Code2 size={28}/><h2>Room for a new thought</h2><p>Open a Markdown file from the sidebar<br/>or create something new.</p><button className="text-button" onClick={() => newItem('file')}><FilePlus2 size={15}/>Create a Markdown file</button></div>}<div className="pane-footer"><span>Ln {position.line}, Col {position.column}</span><span>UTF-8</span></div></>}
          {p === 'preview' && <>{paneHeader(p, <Eye size={16}/>, 'Preview', 'LIVE')}<div className="preview-toolbar"><span><i/>Rendered as you write</span><span>{direction === 'rtl' ? 'راست به چپ' : 'Reading view'}</span></div><div className="preview-content" dir={direction}>{doc ? (doc.content ? <Markdown content={doc.content} workspace={selectedWorkspace} path={doc.path} onOpen={path => void open(path)}/> : <div className="pane-placeholder"><FileText size={28}/><h2>A blank page, endless possibilities.</h2><p>Your preview will appear here as you write.</p></div>) : <div className="welcome"><span className="eyebrow">YOUR WORDS. YOUR FILES.</span><h1>A clear mind starts<br/>with a blank page.</h1><p>A quiet place to write, shape ideas, and see them come to life. All in plain Markdown.</p><div className="welcome-rule"/><h3>Make yourself at home</h3><ul><li><FolderOpen size={17}/><span>Open your local Markdown files</span></li><li><Columns3 size={17}/><span>Drag the dividers to find your focus</span></li><li><Save size={17}/><span>Autosave, or save with <kbd>Ctrl / ⌘ S</kbd></span></li></ul><blockquote dir="rtl" lang="fa">جایی برای نوشتن، به زبان خودتان.<small>Persian & right-to-left writing, built in.</small></blockquote></div>}</div><div className="pane-footer"><span>{words.toLocaleString()} words</span><span>{Math.max(1, Math.ceil(words / 200))} min read</span></div></>}
        </section>
        {i < visible.length - 1 && <div className="resize-handle" role="separator" aria-label={`Resize ${p} and ${visible[i + 1]} panes`} aria-orientation="vertical" aria-valuenow={Math.round(prefs.widths[p])} tabIndex={0} onPointerDown={e => startResize(e, p, visible[i + 1])} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resize(p, visible[i + 1], e.key === 'ArrowLeft' ? -30 : 30); } }}><span/></div>}
      </div>)}
      {!visible.length && <div className="all-closed"><Columns3 size={32}/><h2>A little breathing room.</h2><p>Open a pane above, or bring back the full workspace.</p><button className="primary-button" onClick={() => setPrefs(v => ({ ...v, panes: defaults.panes }))}>Restore all panes</button></div>}
    </main></div>
    <footer className="statusbar"><div className="save-controls"><button className={`autosave-switch ${prefs.auto ? 'on' : ''}`} role="switch" aria-checked={prefs.auto} aria-label="Autosave" onClick={() => setPrefs(v => ({ ...v, auto: !v.auto }))}><span><i/></span>Autosave <strong>{prefs.auto ? 'on' : 'off'}</strong></button><span className={`save-status ${saveError ? 'failed' : ''}`} role="status">{status === 'Saved' ? <Check size={14}/> : <i className="dot"/>}{busy ? 'Opening…' : status}</span></div><div className="editor-settings"><label title="Text direction"><Settings2 size={14}/><select aria-label="Text direction" value={prefs.direction} onChange={e => setPrefs(v => ({ ...v, direction: e.target.value as Preferences['direction'] }))}><option value="auto">Auto direction</option><option value="ltr">LTR · Left to right</option><option value="rtl">RTL · فارسی</option></select></label><button className="save-button" disabled={!doc || busy || creating || !dirty} title="Save (Ctrl/Cmd+S)" onClick={() => void save().catch(() => {})}><Save size={15}/>Save<kbd>⌘ / Ctrl S</kbd></button></div></footer>
    <WorkspacePicker open={pickerOpen} selected={selectedWorkspace} browseRoot={browseRoot} onClose={() => setPickerOpen(false)} onChoose={changeWorkspace}/>
    <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={e => { if (creating) e.preventDefault(); else setModal(null); }}><form onSubmit={e => { e.preventDefault(); void (modal === 'reload' ? reload() : create()); }}><div className="modal-heading"><span>{modal === 'reload' ? <RefreshCw size={21}/> : modal === 'file' ? <FilePlus2 size={21}/> : <FolderPlus size={21}/>}</span><button type="button" className="icon-button" aria-label="Close dialog" disabled={creating} onClick={() => setModal(null)}><X size={18}/></button></div><h2 id="modal-title">{modal === 'reload' ? 'Load the latest version?' : modal === 'file' ? 'A new page' : 'Keep things organized'}</h2><p>{modal === 'reload' ? 'This replaces your unsaved text with the file on disk. Download your draft first if you want to keep it.' : `Create a ${modal === 'file' ? 'Markdown file' : 'folder'} in ${folder || 'the workspace root'}.`}</p>{modal !== 'reload' && <label className="name-label">{modal === 'file' ? 'FILE NAME' : 'FOLDER NAME'}<input ref={dialogInput} value={name} disabled={creating} onChange={e => setName(e.target.value)} placeholder={modal === 'file' ? 'my-new-note.md' : 'my-notes'} required dir="auto"/></label>}{modalError && <p className="modal-error" role="alert">{modalError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={creating} onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={creating}>{creating ? 'Working…' : modal === 'reload' ? 'Load latest' : modal === 'file' ? 'Create file' : 'Create folder'}</button></div></form></dialog>
  </div>;
}
