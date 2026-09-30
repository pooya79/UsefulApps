import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronRight, Folder, FolderOpen, Home, X } from 'lucide-react';
import type { FolderListing } from '../shared/types';
import { api } from './api';
export function WorkspacePicker({ open, selected, browseRoot, onClose, onChoose }: {
  open: boolean; selected: string; browseRoot: string; onClose: () => void; onChoose: (path: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const focus = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  const inputVersion = useRef(0);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const browse = async (folder: string) => {
    const sequence = ++request.current;
    const version = inputVersion.current;
    setLoading(true); setError('');
    try {
      const next = await api<FolderListing>(`folders?path=${encodeURIComponent(folder)}`);
      if (sequence === request.current) { setListing(next); if (version === inputVersion.current) setPath(next.root); }
    } catch (e) { if (sequence === request.current) setError((e as Error).message); }
    finally { if (sequence === request.current) setLoading(false); }
  };
  useEffect(() => {
    if (open) {
      focus.current = document.activeElement as HTMLElement; dialog.current?.showModal(); setListing(null);
      void browse(selected);
    } else { request.current++; setLoading(true); dialog.current?.close(); focus.current?.focus(); }
  }, [open, selected]);
  const go = () => {
    const root = browseRoot.replace(/\/$/, '');
    const relative = path === root ? '' : path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
    void browse(relative);
  };
  const choose = async () => {
    if (!listing) return;
    setChoosing(true); setError('');
    try { await onChoose(listing.path); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setChoosing(false); }
  };
  return <dialog ref={dialog} className="modal workspace-picker" aria-labelledby="workspace-picker-title" onCancel={e => { if (choosing) e.preventDefault(); else onClose(); }}>
    <div className="modal-heading"><span><FolderOpen size={21}/></span><button className="icon-button" aria-label="Close workspace picker" disabled={choosing} onClick={onClose}><X size={18}/></button></div>
    <h2 id="workspace-picker-title">Change workspace</h2><p>Choose a folder for your Markdown files. Pending edits are saved before switching.</p>
    <form className="folder-location" onSubmit={e => { e.preventDefault(); go(); }}>
      <label className="name-label">FOLDER PATH<input aria-label="Folder path" value={path} onChange={e => { inputVersion.current++; setPath(e.target.value); }} disabled={choosing || loading} placeholder={browseRoot}/></label>
      <button className="secondary-button" disabled={choosing || loading}>Browse</button>
    </form>
    <div className="picker-navigation"><button disabled={loading || choosing || !listing || listing.parent === null} onClick={() => listing?.parent !== null && listing && void browse(listing.parent)}><ArrowUp size={15}/>Up</button><button disabled={loading || choosing} onClick={() => void browse('')}><Home size={15}/>Home folder</button></div>
    {error && <p className="modal-error" role="alert">{error}</p>}
    <nav className="picker-folders" aria-label="Workspace folders" aria-busy={loading}>
      {loading ? <p className="muted-note">Loading folders…</p> : listing?.folders.map(folder => <button key={folder.path} disabled={choosing} title={folder.path} onClick={() => void browse(folder.path)}><Folder size={17}/><span dir="auto">{folder.name}</span><ChevronRight size={15}/></button>)}
      {!loading && listing?.folders.length === 0 && <p className="muted-note">No subfolders. You can use this folder as your workspace.</p>}
    </nav>
    <div className="picker-selected"><small>SELECTED FOLDER</small><code dir="auto">{listing?.root || 'Choose a folder'}</code></div>
    <div className="modal-actions"><button className="secondary-button" disabled={choosing} onClick={onClose}>Cancel</button><button className="primary-button" disabled={choosing || loading || !listing} onClick={() => void choose()}>{choosing ? 'Switching…' : 'Use this folder'}</button></div>
  </dialog>;
}
