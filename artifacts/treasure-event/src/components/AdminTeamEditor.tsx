import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PencilLine, RefreshCw, Upload, X } from 'lucide-react';
import {
  getListParticipantRegistrationsQueryKey,
  useRequestAdminMemberUpload,
  useUpdateAdminRegistrationMembers,
} from '@workspace/api-client-react';
import type { AdminRegistrationDetail } from '@workspace/api-client-react';

const MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX = 10 * 1024 * 1024;
type Mode = 'correction' | 'replacement';
type UpStatus = 'idle' | 'uploading' | 'done' | 'error';
interface Row { position: number; original: string; fullName: string; mode: Mode; up: UpStatus; upName: string; uploadId: string; upError: string; file: File | null }
interface Snapshot { revision: number; teamName: string; rows: Row[] }

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const apiMessage = (e: unknown) => {
  const m = (e as { data?: { error?: unknown } } | null)?.data?.error;
  return typeof m === 'string' && m ? m : '';
};
const isAdminKey = (k: unknown) => typeof k === 'string' && k.startsWith('/api/admin/registrations');

export default function AdminTeamEditor({ registrationId, onReload, onExpired }: {
  registrationId: string;
  onReload: () => Promise<{ data?: AdminRegistrationDetail; isError?: boolean }>;
  onExpired: () => void;
}) {
  const queryClient = useQueryClient();
  const uploadReq = useRequestAdminMemberUpload();
  const save = useUpdateAdminRegistrationMembers();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [teamName, setTeamName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState('');
  const keyRef = useRef(newKey());
  const tokens = useRef<Record<number, number>>({});
  const aborts = useRef<Record<number, AbortController>>({});

  const abortAll = () => {
    for (const k of Object.keys(tokens.current)) tokens.current[Number(k)] += 1;
    for (const c of Object.values(aborts.current)) c.abort();
    aborts.current = {};
  };
  useEffect(() => () => abortAll(), []);

  const begin = async () => {
    setOpening(true); setOpenError(''); setSaved(''); setError(''); setConflict(false);
    try {
      const res = await onReload();
      const d = res.data;
      if (res.isError || !d) { setOpenError('The latest record could not be loaded. Editing stays closed until it loads.'); return; }
      abortAll();
      keyRef.current = newKey();
      const r = d.members.map((m) => ({ position: m.position, original: m.fullName, fullName: m.fullName, mode: 'correction' as Mode, up: 'idle' as UpStatus, upName: '', uploadId: '', upError: '', file: null }));
      setSnap({ revision: d.revision, teamName: d.registration.teamName, rows: r });
      setTeamName(d.registration.teamName);
      setRows(r);
      setConfirming(false); setVerified(false); setAttempted(false);
      setOpen(true);
    } catch (e) {
      if (statusOf(e) === 401) { onExpired(); return; }
      setOpenError('The latest record could not be loaded. Please retry.');
    } finally { setOpening(false); }
  };

  const discard = () => {
    abortAll();
    setOpen(false); setSnap(null); setRows([]); setConfirming(false); setVerified(false);
    setError(''); setConflict(false); setAttempted(false);
  };

  const patchRow = (position: number, p: Partial<Row>) => setRows((s) => s.map((r) => r.position === position ? { ...r, ...p } : r));
  const edit = (position: number, p: Partial<Row>) => { patchRow(position, p); setConfirming(false); setVerified(false); };

  const setMode = (row: Row, mode: Mode) => {
    if (mode === 'correction') {
      tokens.current[row.position] = (tokens.current[row.position] ?? 0) + 1;
      aborts.current[row.position]?.abort();
      edit(row.position, { mode, up: 'idle', upName: '', uploadId: '', upError: '', file: null });
    } else edit(row.position, { mode });
  };

  const doUpload = async (position: number, file: File) => {
    const token = tokens.current[position] = (tokens.current[position] ?? 0) + 1;
    aborts.current[position]?.abort();
    const ctrl = new AbortController();
    aborts.current[position] = ctrl;
    const patch = (p: Partial<Row>) => { if (tokens.current[position] === token) patchRow(position, p); };
    setConfirming(false); setVerified(false);
    if (!(MIME as readonly string[]).includes(file.type)) return patch({ up: 'error', upName: file.name, file, uploadId: '', upError: 'File must be JPG, PNG, WebP or PDF.' });
    if (file.size < 1 || file.size > MAX) return patch({ up: 'error', upName: file.name, file, uploadId: '', upError: 'File must be 10 MB or smaller.' });
    patch({ up: 'uploading', upName: file.name, file, uploadId: '', upError: '' });
    try {
      const { uploadId, uploadURL } = await uploadReq.mutateAsync({
        id: registrationId,
        data: { submissionKey: keyRef.current, memberPosition: position, name: file.name.slice(0, 200), size: file.size, contentType: file.type as (typeof MIME)[number] },
      });
      if (tokens.current[position] !== token) return;
      const sameOrigin = new URL(uploadURL, window.location.href).origin === window.location.origin;
      const timeout = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type }, signal: ctrl.signal, credentials: sameOrigin ? 'same-origin' : 'omit' }).finally(() => clearTimeout(timeout));
      if (!res.ok) throw new Error(`PUT ${res.status}`);
      patch({ up: 'done', uploadId, upError: '' });
    } catch (err) {
      if (tokens.current[position] !== token) return;
      if (statusOf(err) === 401) onExpired();
      const m = apiMessage(err);
      patch({ up: 'error', uploadId: '', upError: m ? `Upload failed: ${m}` : 'Upload failed. Please retry.' });
    }
  };

  const cancelUpload = (position: number) => {
    tokens.current[position] = (tokens.current[position] ?? 0) + 1;
    aborts.current[position]?.abort();
    patchRow(position, { up: 'idle', upName: '', uploadId: '', upError: '', file: null });
  };

  const tn = teamName.trim();
  const teamErr = !tn ? 'Team name is required.' : tn.length < 2 ? 'At least 2 characters.' : tn.length > 120 ? 'At most 120 characters.' : '';
  const nameErr = (r: Row) => { const n = r.fullName.trim(); return !n ? 'Full name is required.' : n.length > 160 ? 'At most 160 characters.' : ''; };
  const uploading = rows.some((r) => r.up === 'uploading');
  const invalid = !!teamErr || rows.some((r) => nameErr(r) || (r.mode === 'replacement' && r.up !== 'done'));
  const changed = !!snap && (tn !== snap.teamName || rows.some((r) => r.mode === 'replacement' || r.fullName.trim() !== r.original));
  const busy = save.isPending;

  const review = () => {
    setAttempted(true); setError('');
    if (!changed) { setError('Nothing has changed yet.'); return; }
    if (invalid) { setError('Fix the highlighted fields. Every replacement needs a new student ID upload.'); return; }
    setConfirming(true); setVerified(false);
  };

  const submit = async () => {
    if (!snap || busy || uploading || invalid || !verified) return;
    setError('');
    try {
      const result = await save.mutateAsync({
        id: registrationId,
        data: {
          revision: snap.revision, submissionKey: keyRef.current, teamName: tn, confirmed: true,
          members: rows.map((r) => ({ position: r.position, fullName: r.fullName.trim(), action: r.mode, ...(r.mode === 'replacement' ? { studentIdUploadId: r.uploadId } : {}) })),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ predicate: (q) => isAdminKey(q.queryKey[0]) }),
        queryClient.invalidateQueries({ queryKey: getListParticipantRegistrationsQueryKey() }),
      ]);
      abortAll();
      keyRef.current = newKey();
      setOpen(false); setSnap(null); setRows([]); setConfirming(false); setVerified(false); setAttempted(false);
      setSaved(`Saved as revision ${result.revision}. The Google Sheets update is queued, not yet delivered.`);
    } catch (err) {
      const s = statusOf(err);
      if (s === 401) { onExpired(); setError('Your session expired. Sign in again and reload the team before editing.'); return; }
      if (s === 409) { setConflict(true); setConfirming(false); setError('This registration changed since you opened the editor. Nothing was overwritten. Reload the latest record and discard these edits to continue.'); return; }
      const m = apiMessage(err);
      if (s && s >= 400 && s < 500 && m) { setError(`Not saved: ${m}`); return; }
      setError('The save could not be confirmed. Your edits and uploads are kept; retrying is safe and will not apply twice.');
    }
  };

  const summary = snap ? [
    ...(tn !== snap.teamName ? [`Team name: "${snap.teamName}" to "${tn}"`] : []),
    ...rows.filter((r) => r.mode === 'replacement' || r.fullName.trim() !== r.original).map((r) => r.mode === 'replacement'
      ? `Member ${r.position + 1}${r.position === 0 ? ' (leader)' : ''}: replace "${r.original}" with "${r.fullName.trim()}" using new student ID ${r.upName}. The old student ID leaves the current roster.`
      : `Member ${r.position + 1}${r.position === 0 ? ' (leader)' : ''}: spelling correction "${r.original}" to "${r.fullName.trim()}". Existing student ID kept.`),
  ] : [];

  if (!open) return (
    <div className="detail-section team-editor" data-testid="section-team-editor">
      <div className="team-editor-head">
        <h3>Correct team details</h3>
        <button type="button" className="retry-button" onClick={() => void begin()} disabled={opening} data-testid="button-open-team-editor">
          {opening ? <RefreshCw size={14} className="spin-icon" /> : <PencilLine size={14} />}{opening ? 'Loading latest…' : 'Edit names / substitute'}
        </button>
      </div>
      <p className="member-student-note">Fix spelling or record a verified substitution. Roster size, account, payment, reference and registration email stay unchanged.</p>
      {openError && <p className="retry-error" role="alert">{openError}</p>}
      {saved && <p className="retry-notice team-editor-saved" role="status" data-testid="status-team-saved"><CheckCircle2 size={14} /> {saved}</p>}
    </div>
  );

  return (
    <div className="detail-section team-editor is-open" data-testid="form-team-editor">
      <div className="team-editor-head">
        <h3>Correct team details <span>rev {snap?.revision}</span></h3>
        <button type="button" className="close-detail" aria-label="Cancel editing" onClick={discard} disabled={busy} data-testid="button-cancel-team-editor"><X size={16} /></button>
      </div>
      <p className="member-student-note">Editing a snapshot loaded when you opened this form. Live refresh will not overwrite your edits.</p>

      <label className="te-label" htmlFor="te-team">Team name</label>
      <input id="te-team" className="te-input" value={teamName} maxLength={120} disabled={busy || conflict}
        onChange={(e) => { setTeamName(e.target.value); setConfirming(false); setVerified(false); }} aria-invalid={attempted && teamErr ? true : undefined} data-testid="input-te-team-name" />
      {attempted && teamErr && <span className="te-err">{teamErr}</span>}

      <ol className="te-members">
        {rows.map((r) => {
          const ne = attempted ? nameErr(r) : '';
          const fid = `te-file-${r.position}`;
          return (
            <li key={r.position} data-testid={`row-te-member-${r.position}`}>
              <div className="te-member-top">
                <span className="te-pos">{String(r.position + 1).padStart(2, '0')}{r.position === 0 && <em>Leader</em>}</span>
                <div className="te-modes" role="radiogroup" aria-label={`Change type for member ${r.position + 1}`}>
                  {(['correction', 'replacement'] as Mode[]).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={r.mode === m} className={r.mode === m ? 'on' : ''} disabled={busy || conflict}
                      onClick={() => setMode(r, m)} data-testid={`button-te-mode-${m}-${r.position}`}>{m === 'correction' ? 'Spelling correction' : 'Replace person'}</button>
                  ))}
                </div>
              </div>
              <small className="te-was">On record: {r.original}</small>
              <input className="te-input" value={r.fullName} maxLength={160} disabled={busy || conflict} aria-label={`Full name, member ${r.position + 1}`}
                aria-invalid={ne ? true : undefined} onChange={(e) => edit(r.position, { fullName: e.target.value })} data-testid={`input-te-name-${r.position}`} />
              {ne && <span className="te-err">{ne}</span>}
              {r.mode === 'correction' ? <small className="te-hint">Same person. Current student ID is kept.</small> : (
                <div className="te-upload">
                  <label htmlFor={fid} className={`te-drop${r.up === 'done' ? ' done' : ''}`}>
                    <Upload size={13} /> {r.up === 'done' ? `Uploaded: ${r.upName}` : r.up === 'uploading' ? `Uploading ${r.upName}` : 'Upload new student ID'}
                  </label>
                  <input id={fid} className="te-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    disabled={r.up === 'uploading' || busy || conflict} data-testid={`input-te-file-${r.position}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(r.position, f); e.target.value = ''; }} />
                  <div aria-live="polite" className="te-upstate">
                    {r.up === 'uploading' && <><div className="te-bar"><i /></div><button type="button" className="te-link" onClick={() => cancelUpload(r.position)} data-testid={`button-te-cancel-${r.position}`}>Cancel</button></>}
                    {r.up === 'error' && <span className="te-err">{r.upError}</span>}
                    {r.up === 'error' && r.file && <button type="button" className="te-link" onClick={() => r.file && void doUpload(r.position, r.file)} data-testid={`button-te-retry-${r.position}`}>Retry upload</button>}
                    {r.up === 'idle' && <span className={attempted ? 'te-err' : 'te-hint'}>Required, even if the name is unchanged. JPG, PNG, WebP or PDF, up to 10 MB.</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error && <div className="retry-error" role="alert" data-testid="text-te-error">{error}
        {conflict && <div className="te-actions"><button type="button" className="retry-button" onClick={() => void begin()} disabled={opening} data-testid="button-te-reload">
          <RefreshCw size={13} className={opening ? 'spin-icon' : ''} /> Discard edits and reload latest</button></div>}
      </div>}

      {confirming && !conflict && (
        <div className="te-confirm" data-testid="panel-te-confirm">
          <strong>Review before saving</strong>
          <ul>{summary.map((s) => <li key={s}>{s}</li>)}</ul>
          <p>Account ownership, payment proof, reference code and registration email are preserved.</p>
          <label className="te-check"><input type="checkbox" checked={verified} disabled={busy} onChange={(e) => setVerified(e.target.checked)} data-testid="checkbox-te-verified" />
            I have verified these changes with the team and supporting documents.</label>
        </div>
      )}

      <div className="te-actions">
        <button type="button" className="admin-secondary" onClick={discard} disabled={busy} data-testid="button-te-discard">Cancel</button>
        {!confirming ? (
          <button type="button" className="admin-primary" onClick={review} disabled={uploading || conflict} data-testid="button-te-review">{uploading ? 'Wait for uploads' : 'Review changes'}</button>
        ) : (
          <button type="button" className="admin-primary" onClick={() => void submit()} disabled={!verified || busy || uploading || conflict} aria-busy={busy} data-testid="button-te-save">
            {busy ? 'Saving…' : error ? 'Retry save' : 'Confirm and save'}</button>
        )}
      </div>
    </div>
  );
}
