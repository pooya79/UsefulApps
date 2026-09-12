import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, CloudUpload, Copy, FileText, RefreshCw } from 'lucide-react';
import type { Document } from '../shared/schema';
import { api } from './api';
import { Markdown } from './Markdown';
export type EditorHandle = { flush: () => Promise<boolean> };
export const Editor = forwardRef<EditorHandle, { document: Document; onSaved: (doc: Document) => void }>(function Editor({ document, onSaved }, ref) {
  const [draft, setDraft] = useState(document);
  const latest = useRef(document); const saved = useRef(document); const pending = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState('Saved'); const [error, setError] = useState(''); const [tab, setTab] = useState<'write' | 'preview'>('write');
  const dirty = () => latest.current.title !== saved.current.title || latest.current.content !== saved.current.content;
  const flush = (): Promise<boolean> => {
    if (pending.current) return pending.current;
    const run = async () => {
      while (dirty()) {
        const current = latest.current;
        if (!current.title.trim()) { setError('Give this document a title before saving.'); setStatus('Error'); return false; }
        setStatus('Saving'); setError('');
        try {
          const result = await api<Document>(`/documents/${document.id}`, 'PATCH', { title: current.title, content: current.content, revision: saved.current.revision });
          saved.current = result; onSaved(result);
          // Preserve typing that happened while the request was in flight.
          if (latest.current === current) { latest.current = result; setDraft(result); }
        } catch (e) { setStatus('Error'); setError((e as Error).message); return false; }
      }
      setStatus('Saved'); return true;
    };
    pending.current = run().finally(() => { pending.current = null; }); return pending.current;
  };
  useImperativeHandle(ref, () => ({ flush }));
  useEffect(() => { if (!dirty()) return; const timer = setTimeout(() => void flush(), 650); return () => clearTimeout(timer); }, [draft]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  const change = (patch: Partial<Document>) => { const next = { ...latest.current, ...patch }; latest.current = next; setDraft(next); setStatus('Unsaved'); };
  const reload = async () => {
    if (!window.confirm('Discard this unsaved draft and load the latest saved version? Copy the draft first if you need it.')) return;
    try { const result = await api<Document>(`/documents/${document.id}`); latest.current = result; saved.current = result; setDraft(result); onSaved(result); setStatus('Saved'); setError(''); } catch (e) { setError((e as Error).message); }
  };
  const words = draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0;
  return <section className="editor" aria-label="Document editor">
    <div className="editor-heading"><div className="eyebrow"><FileText size={14}/> YOUR DOCUMENT</div><div className={`save-state ${status === 'Error' ? 'danger-text' : ''}`} role="status">{status === 'Saved' ? <Check size={14}/> : <CloudUpload size={14}/>} {status}</div></div>
    <input className="document-title" aria-label="Document title" maxLength={200} value={draft.title} onChange={e => change({ title: e.target.value })}/>
    <div className="document-meta">A little space to think, explore, and connect the dots.<span>{words} words · Revision {saved.current.revision}</span></div>
    {error && <div className="save-error" role="alert"><span>{error} Your draft is still in this editor.</span><button onClick={() => void flush()}><CloudUpload size={14}/> Retry save</button><button onClick={() => void navigator.clipboard.writeText(`${draft.title}\n\n${draft.content}`).catch(() => setError('Clipboard unavailable. Select and copy the text from the editor.'))}><Copy size={14}/> Copy draft</button><button onClick={() => void reload()}><RefreshCw size={14}/> Load latest</button></div>}
    <div className="mobile-tabs" role="tablist" aria-label="Editor view"><button role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>Write</button><button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button></div>
    <div className={`editor-panes show-${tab}`}><div className="source-pane"><div className="pane-label">MARKDOWN <span>Write freely.</span></div><textarea aria-label="Markdown source" spellCheck value={draft.content} onChange={e => change({ content: e.target.value })} placeholder={'# A spark of an idea\n\nStart writing. This space is yours.\n\n- What if…\n- Why does it matter?\n- What comes next?'} /></div><div className="preview-pane"><div className="pane-label">LIVE PREVIEW <span>Watch it take shape.</span></div>{draft.content ? <Markdown content={draft.content}/> : <div className="preview-empty"><span>Every good idea<br/>starts somewhere.</span><p>Your words will appear here as you write.</p></div>}</div></div>
    <footer className="editor-footer"><span>Markdown & GFM supported</span><span>Autosaved to your library</span></footer>
  </section>;
});
