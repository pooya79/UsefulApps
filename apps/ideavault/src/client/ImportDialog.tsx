import { useState } from 'react';
import type { Backup, ImportPreview, Library, Entity } from '../shared/schema';
import { api } from './api';
import { Modal } from './Modal';
function describe(e: Entity) { return 'deletedAt' in e ? `Permanently deleted ${new Date(e.deletedAt).toLocaleString()}` : `${e.trashedAt ? 'In trash · ' : ''}${new Date(e.updatedAt).toLocaleString()}${'revision' in e ? ` · Revision ${e.revision}` : ''}`; }
export function ImportDialog({ onClose, onApplied }: { onClose: () => void; onApplied: (b: Library) => void }) {
  const [backup, setBackup] = useState<Backup | null>(null); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge'); const [resolutions, setResolutions] = useState<Record<string, 'local' | 'imported'>>({});
  const [confirm, setConfirm] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    setBusy(true); setError(''); setPreview(null); setBackup(null); setResolutions({}); setConfirm(false);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Backup must be smaller than 25 MB.');
      const b = JSON.parse(await file.text()) as Backup;
      const p = await api<ImportPreview>('/import/preview', 'POST', b); setBackup(b); setPreview(p);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!backup || !preview) return; setBusy(true); setError('');
    try { const result = await api<Library>('/import/apply', 'POST', { backup, mode, token: preview.token, resolutions, confirmReplace: confirm }); onApplied(result); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Modal title="Bring your ideas home" onClose={() => { if (!busy) onClose(); }} wide>
    <p>Import an IdeaVault JSON backup. Review the changes before anything is written.</p>
    <label className="file-picker">Choose a backup file<input type="file" accept="application/json,.json" disabled={busy} onChange={e => { if (e.target.files?.[0]) void read(e.target.files[0]); }}/></label>
    {error && <p role="alert" className="error-box">{error}</p>}
    {busy && <p role="status">Working with your backup…</p>}
    {preview && backup && <><div className="import-counts"><span><b>{preview.additions}</b> additions</span><span><b>{preview.unchanged}</b> unchanged</span><span><b>{preview.conflicts.length}</b> conflicts</span><span><b>{preview.deletions}</b> deletion records / conflicts</span></div>
      <fieldset><legend>Import mode</legend><label><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')}/> Merge with my library</label><label><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')}/> Replace my entire library</label></fieldset>
      {mode === 'merge' ? <><p>Existing items absent from this backup stay in your library. Resolve every difference, including metadata and deletions. Parent and document choices must remain consistent.</p>{preview.conflicts.map(c => <fieldset className="conflict" key={c.id}><legend>{c.label}</legend><div className="conflict-options">{(['local', 'imported'] as const).map(side => <label key={side}><input type="radio" name={c.id} checked={resolutions[c.id] === side} onChange={() => setResolutions(r => ({ ...r, [c.id]: side }))}/><b>Keep {side}</b><small>{describe(c[side])}</small><details><summary>Inspect record</summary><pre>{JSON.stringify(c[side], null, 2)}</pre></details></label>)}</div></fieldset>)}</> : <div className="replace-warning"><h3>This replaces everything.</h3><p>Your current projects, documents, trash, and deletion history will be replaced by {backup.projects.length} projects and {backup.documents.length} documents from this file. Export your current library first if you need a recovery copy.</p><label><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)}/> I understand and confirm complete replacement.</label></div>}
      <div className="modal-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button className={mode === 'replace' ? 'danger-button' : 'primary'} disabled={busy || (mode === 'replace' ? !confirm : preview.conflicts.some(c => !resolutions[c.id]))} onClick={() => void apply()}>{mode === 'replace' ? 'Replace entire library' : 'Apply merge'}</button></div>
    </>}
  </Modal>;
}
