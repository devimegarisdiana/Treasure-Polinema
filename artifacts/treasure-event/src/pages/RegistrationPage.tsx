import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, FileLock2, Lock, RefreshCw, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListParticipantRegistrationsQueryKey,
  useCompleteParticipantRegistration,
  useListParticipantRegistrations,
  useRequestUploadUrl,
} from '@workspace/api-client-react';
import type { ParticipantRegistration, ParticipantRegistrationList } from '@workspace/api-client-react';
import ParticipantAuth from '../components/ParticipantAuth';
import ChangeParticipantPassword from '../components/ChangeParticipantPassword';
import { useParticipantAuth } from '../hooks/use-participant-auth';
import './registration.css';

const BASE = (import.meta.env.BASE_URL as string).replace(/\/+$/, '');
const home = `${BASE}/`;
const PARTICIPANT_GROUP_URL = 'https://chat.whatsapp.com/JpCQ5ZJIaEvCdou5uNoFrA';
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX = 10 * 1024 * 1024;
const listKey = getListParticipantRegistrationsQueryKey();

type UpStatus = 'uploading' | 'done' | 'error';
interface Up { status: UpStatus; name: string; uploadId: string; error: string; file: File | null }

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

function RegistrationCard({ reg, ownerId, onExpired, onReload }: { reg: ParticipantRegistration; ownerId: string; onExpired: () => void; onReload: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const uploadUrl = useRequestUploadUrl();
  const complete = useCompleteParticipantRegistration();
  const confirmedName = reg.revision === 0 && reg.teamName === reg.members[0]?.fullName.slice(0, 120) ? '' : reg.teamName;
  const [teamName, setTeamName] = useState(confirmedName);
  const [edited, setEdited] = useState(false);
  const [baseRevision, setBaseRevision] = useState(reg.revision);
  const [ups, setUps] = useState<Record<number, Up>>({});
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const keyRef = useRef(newKey());
  const tokens = useRef<Record<number, number>>({});
  const aborts = useRef<Record<number, AbortController>>({});

  useEffect(() => () => {
    for (const k of Object.keys(tokens.current)) tokens.current[Number(k)] += 1;
    for (const c of Object.values(aborts.current)) c.abort();
  }, []);

  useEffect(() => {
    if (!edited && !conflict) { setTeamName(confirmedName); setBaseRevision(reg.revision); }
  }, [confirmedName, reg.revision, edited, conflict]);

  const missing = reg.members.filter((m) => !m.studentIdUrl);
  const uploading = Object.values(ups).some((u) => u.status === 'uploading');
  const busy = uploading || complete.isPending;
  const tn = teamName.trim();
  const teamErr = !tn ? 'Team name is required.' : tn.length < 2 ? 'At least 2 characters.' : tn.length > 120 ? 'At most 120 characters.' : '';
  const missingErr = missing.filter((m) => ups[m.position]?.status !== 'done');
  const complete_ = !reg.paymentProofUrl ? false : true;

  const doUpload = async (position: number, file: File) => {
    const token = tokens.current[position] = (tokens.current[position] ?? 0) + 1;
    aborts.current[position]?.abort();
    const ctrl = new AbortController();
    aborts.current[position] = ctrl;
    const patch = (u: Partial<Up>) => {
      if (tokens.current[position] === token) setUps((s) => ({ ...s, [position]: { ...(s[position] ?? { status: 'error', name: '', uploadId: '', error: '', file: null }), ...u } }));
    };
    setSaved(false);
    if (!(MIME as readonly string[]).includes(file.type)) return patch({ status: 'error', name: file.name, file, uploadId: '', error: 'File must be JPG, PNG, WebP or PDF.' });
    if (file.size < 1 || file.size > MAX) return patch({ status: 'error', name: file.name, file, uploadId: '', error: 'File must be 10 MB or smaller.' });
    patch({ status: 'uploading', name: file.name, file, uploadId: '', error: '' });
    try {
      const { uploadId, uploadURL } = await uploadUrl.mutateAsync({
        data: {
          submissionKey: keyRef.current, purpose: 'student_id', registrationId: reg.id, memberPosition: position,
          name: file.name.slice(0, 200), size: file.size, contentType: file.type as (typeof MIME)[number],
        },
      });
      if (tokens.current[position] !== token) return;
      const timeout = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type }, signal: ctrl.signal }).finally(() => clearTimeout(timeout));
      if (!res.ok) throw new Error(`PUT ${res.status}`);
      patch({ status: 'done', uploadId, error: '' });
    } catch (err) {
      if (tokens.current[position] !== token) return;
      if (statusOf(err) === 401) onExpired();
      const m = apiMessage(err);
      patch({ status: 'error', uploadId: '', error: m ? `Upload failed: ${m}` : 'Upload failed. Please retry.' });
    }
  };

  const cancelUpload = (position: number) => {
    tokens.current[position] = (tokens.current[position] ?? 0) + 1;
    aborts.current[position]?.abort();
    setUps((s) => { const n = { ...s }; delete n[position]; return n; });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true); setError(''); setSaved(false);
    if (teamErr || missingErr.length) { setError('Add a valid team name and upload every missing student ID before saving.'); return; }
    try {
      const updated = await complete.mutateAsync({
        id: reg.id,
        data: {
          teamName: tn, revision: baseRevision, submissionKey: keyRef.current,
          members: missing.map((m) => ({ position: m.position, studentIdUploadId: ups[m.position].uploadId })),
        },
      });
      queryClient.setQueryData<ParticipantRegistrationList>([...listKey, ownerId], (old) => old ? { ...old, items: old.items.map((i) => i.id === updated.id ? updated : i) } : old);
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/api/admin/registrations') });
      keyRef.current = newKey();
      setUps({}); setEdited(false); setAttempted(false); setTeamName(updated.teamName); setBaseRevision(updated.revision); setSaved(true);
    } catch (err) {
      const s = statusOf(err);
      if (s === 401) { onExpired(); setError('Your session expired. Sign in again; your entries are still here.'); return; }
      if (s === 409) { setConflict(true); setError('This registration changed since you opened it. Load the latest version before saving; nothing was overwritten.'); return; }
      const m = apiMessage(err);
      setError(m ? `Not saved: ${m}` : 'We could not confirm the save. Your entries are kept; you can safely try again.');
    }
  };

  const loadLatest = async () => {
    await onReload();
    const fresh = queryClient.getQueryData<ParticipantRegistrationList>(listKey)?.items.find((i) => i.id === reg.id);
    if (fresh) { setTeamName(fresh.teamName); setBaseRevision(fresh.revision); }
    setEdited(false); setConflict(false); setError('');
  };

  const sheetQueued = /queue|pending/i.test(reg.spreadsheetStatus);
  const pid = `reg-${reg.id}`;
  return (
    <form className="pt-card" onSubmit={submit} noValidate aria-labelledby={`${pid}-t`} data-testid={`card-registration-${reg.id}`}>
      <header className="pt-card-head">
        <div>
          <span className="pt-kicker">Reference</span>
          <strong className="pt-ref" data-testid={`text-reference-${reg.id}`}>{reg.referenceCode}</strong>
        </div>
        <span className={`pt-pill${missing.length ? ' warn' : ''}`} data-testid={`status-completeness-${reg.id}`}>
          {missing.length ? `${missing.length} student ID${missing.length > 1 ? 's' : ''} missing` : 'Documents complete'}
        </span>
      </header>
      <h2 id={`${pid}-t`} className="pt-title">{reg.teamName || 'Untitled team'}</h2>

      {saved && <div className="pt-ok" role="status" data-testid={`status-saved-${reg.id}`}>
        <CheckCircle2 size={17} aria-hidden="true" />
        <div><strong>Saved.</strong> Your private files are kept. The Google Sheets update is queued: {reg.spreadsheetStatus}{sheetQueued ? ' (not yet delivered).' : '.'}</div>
      </div>}
      {error && <div className="reg-alert" role="alert" data-testid={`text-error-${reg.id}`}>
        {error}
        {conflict && <button type="button" className="reg-btn reg-ghost pt-mini" onClick={() => void loadLatest()} data-testid={`button-reload-${reg.id}`}><RefreshCw size={13} /> Load latest</button>}
      </div>}

      <div className="reg-field full">
        <label htmlFor={`${pid}-name`}>Team name *</label>
        <input id={`${pid}-name`} value={teamName} maxLength={120} disabled={complete.isPending}
          onChange={(e) => { setTeamName(e.target.value); setEdited(true); setSaved(false); }}
          aria-invalid={attempted && teamErr ? true : undefined} aria-describedby={attempted && teamErr ? `${pid}-name-e` : `${pid}-name-h`} data-testid={`input-team-name-${reg.id}`} />
        <span className="reg-hint" id={`${pid}-name-h`}>2 to 120 characters.</span>
        {attempted && teamErr && <span className="reg-err" id={`${pid}-name-e`} role="alert">{teamErr}</span>}
      </div>

      <ol className="pt-members">
        {reg.members.map((m) => {
          const u = ups[m.position];
          const inputId = `${pid}-m${m.position}`;
          const err = u?.status === 'error' ? u.error : attempted && !m.studentIdUrl && u?.status !== 'done' ? 'Student ID is required.' : '';
          return (
            <li key={m.position} className="pt-member" data-testid={`row-member-${reg.id}-${m.position}`}>
              <div className="pt-member-name">
                <span className="pt-pos">{String(m.position + 1).padStart(2, '0')}</span>
                <strong>{m.fullName}</strong>
                {m.position === 0 && <em>Leader</em>}
              </div>
              {m.studentIdUrl ? (
                <a className="pt-doc" href={m.studentIdUrl} target="_blank" rel="noreferrer" data-testid={`link-student-id-${reg.id}-${m.position}`}>
                  <FileLock2 size={14} aria-hidden="true" /> {m.studentIdFileName ?? 'Student ID'} <small>private, read-only</small>
                </a>
              ) : (
                <div className="pt-upload">
                  <label htmlFor={inputId} className={`pt-drop${u?.status === 'done' ? ' done' : ''}`}>
                    <Upload size={14} aria-hidden="true" />
                    {u?.status === 'done' ? `Uploaded: ${u.name}` : u?.status === 'uploading' ? `Uploading ${u.name}` : 'Upload student ID'}
                  </label>
                  <input id={inputId} className="pt-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    disabled={u?.status === 'uploading' || complete.isPending} aria-invalid={err ? true : undefined}
                    aria-describedby={`${inputId}-s`} data-testid={`input-file-${reg.id}-${m.position}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(m.position, f); e.target.value = ''; }} />
                  <div id={`${inputId}-s`} aria-live="polite" className="pt-upstate">
                    {u?.status === 'uploading' && <><div className="reg-bar" role="progressbar" aria-label="Uploading"><i /></div>
                      <button type="button" className="pt-link" onClick={() => cancelUpload(m.position)} data-testid={`button-cancel-${reg.id}-${m.position}`}>Cancel</button></>}
                    {err && <span className="reg-err" role="alert">{err}</span>}
                    {u?.status === 'error' && u.file && <button type="button" className="pt-link" disabled={complete.isPending} onClick={() => u.file && void doUpload(m.position, u.file)} data-testid={`button-retry-${reg.id}-${m.position}`}>Retry upload</button>}
                    {!u && <span className="reg-hint">JPG, PNG, WebP or PDF, up to 10 MB.</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="pt-payment">
        <span className="pt-kicker">Payment proof</span>
        {reg.paymentProofUrl
          ? <a className="pt-doc" href={reg.paymentProofUrl} target="_blank" rel="noreferrer" data-testid={`link-payment-${reg.id}`}><FileLock2 size={14} aria-hidden="true" /> View payment proof <small>private, read-only</small></a>
          : <span className="reg-hint">{complete_ ? '' : 'No payment proof on file. Contact the organizers.'}</span>}
      </div>

      <div className="pt-foot">
        <span className="reg-hint">Google Sheets: <b data-testid={`status-sheet-${reg.id}`}>{reg.spreadsheetStatus}</b> · revision {reg.revision}</span>
        <button type="submit" className="reg-btn reg-primary" disabled={busy || conflict} aria-busy={complete.isPending} data-testid={`button-save-${reg.id}`}>
          {complete.isPending ? 'Saving...' : uploading ? 'Wait for uploads' : 'Save team details'}
        </button>
      </div>
    </form>
  );
}

export default function RegistrationPage() {
  const auth = useParticipantAuth();
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);
  const userId = auth.user?.id ?? null;
  const list = useListParticipantRegistrations({
    query: { queryKey: [...listKey, userId], enabled: !!userId && !expired && !auth.user?.mustChangePassword, staleTime: 30_000, refetchOnMount: 'always', refetchOnWindowFocus: true, retry: false },
  });
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    if (lastUser.current && lastUser.current !== userId) {
      const previousKey = [...listKey, lastUser.current];
      void queryClient.cancelQueries({ queryKey: previousKey });
      queryClient.removeQueries({ queryKey: previousKey });
    }
    lastUser.current = userId;
  }, [userId, auth.clearParticipantCache, queryClient]);

  useEffect(() => { if (statusOf(list.error) === 401) setExpired(true); }, [list.error]);

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = 'Participant portal — TREASURE 2026';
  }, []);

  const signOut = async () => {
    queryClient.removeQueries({ queryKey: listKey });
    await auth.logout();
    lastUser.current = null;
    setExpired(false);
  };

  const authBlock = (exp = false) => (
    <ParticipantAuth user={auth.user} loading={auth.isLoading && !exp} checking={auth.isRefreshing}
      sessionError={auth.hasError && !auth.user} expired={exp} busy={auth.isMutating} signInOnly
      onSignIn={async (d) => { await auth.signin(d); setExpired(false); }} onSignOut={signOut} onRetry={auth.refresh} />
  );

  let body;
  if (auth.isLoading || !auth.user) body = authBlock();
  else if (expired) body = authBlock(true);
  else if (auth.user.mustChangePassword) body = <ChangeParticipantPassword onChange={auth.changePassword} onSignOut={signOut} />;
  else {
    const items = list.data?.items ?? [];
    body = (
      <div className="reg-journey pt-journey">
        {authBlock()}
        {list.isLoading ? (
          <div className="pt-card" role="status" aria-label="Loading your registrations"><div className="reg-skel" /><div className="reg-skel" /><div className="reg-skel" /></div>
        ) : list.isError ? (
          <div className="reg-alert" role="alert">
            We could not load your registrations{apiMessage(list.error) ? `: ${apiMessage(list.error)}` : '.'}
            <button type="button" className="reg-btn reg-ghost pt-mini" onClick={() => void list.refetch()} data-testid="button-retry-list">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <section className="pt-empty" data-testid="status-empty">
            <Lock size={22} aria-hidden="true" />
            <h2>No registration on this account.</h2>
            <p>New registration closed on 10 November 2026, so teams can no longer be added. If your team registered with another account, sign out and sign in with that one, or contact the organizers.</p>
          </section>
        ) : (
          <>
            <p className="pt-lede">Complete your team name and any missing student IDs. Files already on record stay private and cannot be changed here.</p>
            {items.map((r) => <RegistrationCard key={`${userId}-${r.id}`} reg={r} ownerId={userId!} onExpired={() => setExpired(true)} onReload={() => list.refetch()} />)}
            <div className="reg-group">
              <h2>Participants’ WhatsApp group</h2>
              <p>Announcements and participant updates for TREASURE 2026.</p>
              <a className="reg-btn reg-yellow" href={PARTICIPANT_GROUP_URL} target="_blank" rel="noopener noreferrer" data-testid="link-participant-whatsapp-group">Join WAG participants</a>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="reg-page">
      <header className="reg-top">
        <a className="reg-brand" href={home} aria-label="Back to home"><img src={`${BASE}/treasure-wordmark.png`} alt="TREASURE 2026" /></a>
        <a className="reg-back" href={home} data-testid="link-home"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> <span>Home</span></a>
      </header>
      <main className="reg-wrap">
        <aside className="reg-aside">
          <div className="pt-seal" aria-hidden="true"><Lock size={26} /></div>
          <div className="reg-eyebrow">Registration · TREASURE 2026</div>
          <h1>Registration is closed.</h1>
          <p>Thank you to every team that registered. The extended final date was 10 November 2026 and no new teams or accounts can be created. Registered participants can sign in below to finish their private documents.</p>
          <div className="reg-facts">
            <div><span>Registration</span><span>Closed · 10 Nov 2026</span></div>
            <div><span>Training</span><span>16—17 Nov 2026</span></div>
            <div><span>Competition</span><span>23—25 Nov 2026</span></div>
            <div><span>Contact</span><a href="https://wa.me/6285230762534" style={{ color: 'var(--treasure-blue)' }} target="_blank" rel="noreferrer">WhatsApp Ms. Abryel</a></div>
            <div><span>Instagram</span><a href="https://www.instagram.com/treasure_polinema/" style={{ color: 'var(--treasure-blue)' }} target="_blank" rel="noreferrer">@treasure_polinema</a></div>
          </div>
        </aside>
        {body}
      </main>
    </div>
  );
}
