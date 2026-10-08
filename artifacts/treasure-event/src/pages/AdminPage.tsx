import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, FileText, LockKeyhole, LogOut, Mail,
  RefreshCw, Search, ShieldAlert, Users, X,
} from 'lucide-react';
import {
  getGetAdminAccessQueryKey, getGetAdminRegistrationQueryKey, getListAdminRegistrationsQueryKey,
  useGetAdminAccess, useGetAdminRegistration, useListAdminRegistrations, useRetryRegistrationEmail,
} from '@workspace/api-client-react';
import { useOrganizerAuth } from '../hooks/use-organizer-auth';
import { OrganizerSignIn } from '../components/OrganizerSignIn';
import type { NotificationStatus } from '@workspace/api-client-react';
import './admin.css';

const BASE = (import.meta.env.BASE_URL as string).replace(/\/+$/, '');
const isHttp401 = (error: unknown) => (error as { status?: number } | null)?.status === 401;
const fmtDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const statusLabel: Record<NotificationStatus, string> = {
  not_requested: 'Not requested', pending: 'Queued', processing: 'Sending', sent: 'Accepted by Resend', failed: 'Failed',
};
const readableSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function AdminPage() {
  const auth = useOrganizerAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryNotice, setRetryNotice] = useState('');
  const [verifiedUser, setVerifiedUser] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const userKey = auth.user?.id ?? '';
  const accessKey = [...getGetAdminAccessQueryKey(), userKey];
  const access = useGetAdminAccess({ query: { enabled: !!auth.user && !auth.isLoading, queryKey: accessKey, retry: false, refetchOnMount: 'always' } });
  const authorized = !!auth.user && verifiedUser === userKey && !access.isFetching && access.isSuccess && access.data?.isAdmin === true;
  const listParams = useMemo(() => ({ page, ...(search ? { search } : {}) }), [page, search]);
  const list = useListAdminRegistrations(listParams, {
    query: { enabled: authorized, queryKey: getListAdminRegistrationsQueryKey(listParams), refetchOnMount: 'always', refetchInterval: authorized ? 30_000 : false },
  });
  const detail = useGetAdminRegistration(selectedId, {
    query: { enabled: authorized && !!selectedId, queryKey: getGetAdminRegistrationQueryKey(selectedId || 'none'), refetchOnMount: 'always', refetchInterval: authorized && !!selectedId ? 30_000 : false },
  });
  const retry = useRetryRegistrationEmail();
  const requestUnauthorized = (access.isError && isHttp401(access.error))
    || (list.isError && isHttp401(list.error))
    || (detail.isError && isHttp401(detail.error));

  const clearPrivateCache = () => {
    setSelectedId('');
    setRetryError('');
    setRetryNotice('');
    queryClient.removeQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.startsWith('/api/admin/');
    } });
  };

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.title = 'Organizer dashboard — TREASURE 2026';
  }, []);
  useEffect(() => {
    setSearchInput('');
    setSearch('');
    setPage(1);
    setVerifiedUser('');
    clearPrivateCache();
    // Reset private state whenever a different account signs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);
  useEffect(() => {
    if (access.isSuccess && !access.isFetching && access.data?.isAdmin === true && userKey) setVerifiedUser(userKey);
    else if (access.isError || access.data?.isAdmin !== true) setVerifiedUser('');
  }, [access.isSuccess, access.isFetching, access.isError, access.data?.isAdmin, userKey]);
  useEffect(() => {
    if (requestUnauthorized) auth.expireSession();
  }, [requestUnauthorized, auth.expireSession]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim().slice(0, 120));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const signOut = async () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
    setVerifiedUser('');
    clearPrivateCache();
    try {
      await auth.logout();
      setLogoutError('');
    } catch {
      setLogoutError('Sign-out could not be confirmed. Records are hidden here, but your server session may still be active. Retry sign-out before leaving this device.');
    }
  };
  const onRetry = async () => {
    if (!selectedId || !detail.data) return;
    setRetryError('');
    setRetryNotice('');
    try {
      const result = await retry.mutateAsync({ id: selectedId });
      setRetryNotice(result.status === 'pending' ? 'Notification queued. Delivery status will update automatically.' : 'Notification request accepted.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminRegistrationQueryKey(selectedId) }),
        queryClient.invalidateQueries({ queryKey: getListAdminRegistrationsQueryKey(listParams) }),
      ]);
    } catch (error) {
      if (isHttp401(error)) {
        auth.expireSession();
        return;
      }
      const data = (error as { data?: { error?: unknown } } | null)?.data?.error;
      setRetryError(typeof data === 'string' ? data : 'The notification could not be queued. Please try again.');
    }
  };
  const retryLabel = detail.data?.notification.status === 'not_requested' ? 'Send notification' : 'Retry notification';
  const mayRetry = !!detail.data && !['sent', 'pending', 'processing'].includes(detail.data.notification.status);
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.pageSize || 20)));
  const setup = list.data?.notificationSetup;

  return (
    <main className="admin-page">
      <header className="admin-top">
        <a href={`${BASE}/`} className="admin-wordmark" aria-label="TREASURE 2026 home"><img src={`${BASE}/treasure-wordmark.png`} alt="TREASURE 2026" /></a>
        <div className="admin-top-right">
          <span className="admin-private"><LockKeyhole size={13} /> Private organizer area</span>
          {auth.isAuthenticated && !requestUnauthorized && <button className="admin-logout" onClick={signOut} type="button"><LogOut size={15} /> Sign out</button>}
        </div>
      </header>

      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <div className="admin-kicker"><span /> Polinema × Edugate · TREASURE 2026</div>
            <h1>Organizer desk</h1>
            <p>Review submitted teams and registration notifications.</p>
          </div>
          {authorized && <div className="admin-live"><i /> Live refresh · 30 sec</div>}
        </div>

        {logoutError && <section className="admin-gate admin-gate-error" role="alert">
          <p>{logoutError}</p>
          <button className="admin-secondary" type="button" disabled={auth.isSigningOut} onClick={() => void signOut()}>
            {auth.isSigningOut ? 'Signing out…' : 'Retry sign-out'}
          </button>
        </section>}
        {auth.isLoading ? (
          <section className="admin-gate" aria-live="polite"><div className="admin-skeleton" /><div className="admin-skeleton short" /><p>Checking your sign-in…</p></section>
        ) : !auth.isAuthenticated || requestUnauthorized ? (
          <OrganizerSignIn
            onSignIn={async (credentials) => { await auth.signin(credentials); setLogoutError(''); }}
            busy={auth.isSigningIn}
            sessionChecking={auth.isRefreshing}
            sessionError={auth.refetchError}
            signinError={auth.signinError}
            onRetrySession={() => void auth.refetch()}
            onClearError={auth.clearSigninError}
          />
        ) : access.isLoading ? (
          <section className="admin-gate" aria-live="polite"><div className="admin-skeleton" /><p>Verifying organizer access…</p></section>
        ) : access.isError ? (
          <section className="admin-gate admin-gate-error" role="alert"><ShieldAlert size={24} /><h2>Access could not be verified</h2><p>Please retry the access check. Registration records remain hidden.</p><button className="admin-secondary" type="button" onClick={() => void access.refetch()}>Retry access check</button></section>
        ) : !authorized ? (
          <section className="admin-gate admin-gate-error" role="alert"><ShieldAlert size={24} /><h2>Organizer access required</h2><p>Your account is signed in, but it is not authorized to view registration data.</p><button className="admin-secondary" type="button" onClick={signOut}>Sign out</button></section>
        ) : (
          <>
            {setup && (!setup.recipient || !setup.sender || setup.note) && (
              <aside className="setup-warning" role="status">
                <div className="warning-icon"><Mail size={17} /></div>
                <div><strong>Notification setup needs attention</strong>
                  <p>{setup.note || 'Email sender configuration is incomplete. Check the server notification setup before retrying.'}</p>
                  <div className="setup-meta"><span>Recipient <b>{setup.recipient || 'Not configured'}</b></span><span>Sender <b>{setup.sender || 'Not configured'}</b></span></div>
                </div>
              </aside>
            )}
            {setup && setup.recipient && setup.sender && !setup.note && (
              <div className="setup-ok"><Mail size={15} /> Email configured <span>{setup.sender} → {setup.recipient}</span></div>
            )}
            <section className={`admin-workspace${selectedId ? ' has-detail' : ''}`}>
              <div className="registrations-panel">
                <div className="list-head">
                  <div><div className="section-eyebrow">Registration records</div><h2>Teams <span>{list.data && !list.isError ? list.data.total : '—'}</span></h2></div>
                  <div className="searchbox"><Search size={16} /><input aria-label="Search registrations" placeholder="Search team, captain, reference…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} data-testid="input-admin-search" /></div>
                </div>
                {list.isLoading && !list.data ? <div className="rows-loading" role="status"><div /><div /><div /><div /></div> :
                  list.isError ? <div className="admin-error" role="alert"><p>Registration records could not be loaded. Private records are hidden until the request succeeds.</p><button type="button" onClick={() => void list.refetch()}>Retry</button></div> :
                  list.data && list.data.items.length === 0 ? <div className="admin-empty"><Users size={22} /><strong>{search ? 'No matching registrations' : 'No registrations yet'}</strong><span>{search ? 'Try another team name, captain or reference code.' : 'Submitted teams will appear here.'}</span></div> :
                  <div className="registration-table-wrap"><table className="registration-table"><thead><tr><th>Team / reference</th><th>Institution</th><th>Origin</th><th>Members</th><th>Notification</th><th><span className="sr-only">Open record</span></th></tr></thead>
                    <tbody>{(list.data?.items ?? []).map((item) => <tr key={item.id} className={selectedId === item.id ? 'is-selected' : ''}>
                      <td><button type="button" className="team-link" onClick={() => { setSelectedId(item.id); setRetryError(''); setRetryNotice(''); }} data-testid={`button-open-registration-${item.id}`}><strong>{item.teamName || item.captainName}</strong><span>{item.referenceCode} · {item.captainName}</span></button></td>
                      <td data-label="Institution">{item.institution || '—'}</td><td data-label="Origin">{item.countryOfOrigin || '—'}</td><td data-label="Members">{item.memberCount}</td>
                      <td data-label="Notification"><StatusPill status={item.notificationStatus} /></td>
                      <td><button type="button" className="open-row" aria-label={`View ${item.teamName || item.captainName}`} onClick={() => setSelectedId(item.id)}><ArrowRight size={16} /></button></td>
                    </tr>)}</tbody></table></div>}
                {list.data && <div className="list-footer"><span>Showing {list.data.total ? (page - 1) * list.data.pageSize + 1 : 0}–{Math.min(page * list.data.pageSize, list.data.total)} of {list.data.total}</span>
                  <div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ArrowLeft size={15} /></button><span>Page {page} of {totalPages}</span><button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ArrowRight size={15} /></button></div>
                </div>}
              </div>
              {selectedId && (
                <aside className="detail-panel" aria-label="Registration details">
                  <div className="detail-head"><div><div className="section-eyebrow">Team record</div><h2>Registration details</h2></div><button type="button" aria-label="Close details" className="close-detail" onClick={() => setSelectedId('')}><X size={18} /></button></div>
                  {detail.isLoading && !detail.data && <div className="detail-loading" role="status"><div /><div /><div /><p>Loading private record…</p></div>}
                  {detail.isError && <div className="admin-error" role="alert"><p>Details could not be loaded. Private record details are hidden until the request succeeds.</p><button type="button" onClick={() => void detail.refetch()}>Retry</button></div>}
                  {!detail.isError && detail.data && <>
                    <div className="detail-team"><span>{detail.data.registration.referenceCode}</span><h3>{detail.data.registration.teamName || detail.data.registration.captainName}</h3><p>{detail.data.registration.institution || 'Institution not provided'} · {detail.data.registration.countryOfOrigin || 'Origin not provided'}</p><small>Submitted {fmtDate(detail.data.registration.createdAt)}</small></div>
                    <div className="detail-section"><h3>Contact</h3><dl><dt>Email</dt><dd><a href={`mailto:${detail.data.contact.email}`}>{detail.data.contact.email}</a></dd><dt>Phone</dt><dd>{detail.data.contact.phone || '—'}</dd><dt>Alternative phone</dt><dd>{detail.data.contact.alternativePhone || '—'}</dd><dt>Faculty / department</dt><dd>{detail.data.contact.facultyDepartment || '—'}</dd><dt>Edugate training</dt><dd>{detail.data.contact.hasEdugateTraining === null ? '—' : detail.data.contact.hasEdugateTraining ? 'Yes' : 'No'}</dd></dl></div>
                    <div className="detail-section"><h3>Team members <span>{detail.data.members.length}</span></h3><ol className="member-list">{detail.data.members.map((member) => <li key={`${member.position}-${member.fullName}`}><span>{String(member.position).padStart(2, '0')}</span>{member.fullName}</li>)}</ol></div>
                    <div className="detail-section"><h3>Private documents <span>{detail.data.documents.length}</span></h3>{detail.data.documents.length ? <div className="document-list">{detail.data.documents.map((doc) => <a href={doc.url} target="_blank" rel="noreferrer" key={doc.id}><FileText size={17} /><span><strong>{doc.fileName}</strong><small>{doc.purpose === 'student_id' ? 'Student ID' : 'Payment proof'} · {readableSize(doc.size)}</small></span><ArrowUpRight size={15} /></a>)}</div> : <p className="detail-muted">No documents attached.</p>}</div>
                    <div className="detail-section notification-section"><div className="notification-title"><div><h3>Email notification</h3><StatusPill status={detail.data.notification.status} /></div><button className="retry-button" type="button" disabled={!mayRetry || retry.isPending} onClick={() => void onRetry()}><RefreshCw size={14} className={retry.isPending ? 'spin-icon' : ''} />{retry.isPending ? 'Queueing…' : retryLabel}</button></div>
                      <p className="delivery-note">“Accepted by Resend” means the provider accepted the message; it does not confirm inbox delivery.</p>
                      <dl><dt>Attempts</dt><dd>{detail.data.notification.attempts}</dd>{detail.data.notification.sentAt && <><dt>Accepted at</dt><dd>{fmtDate(detail.data.notification.sentAt)}</dd></>}{detail.data.notification.nextAttemptAt && <><dt>Next attempt</dt><dd>{fmtDate(detail.data.notification.nextAttemptAt)}</dd></>}{detail.data.notification.lastError && <><dt>Last error</dt><dd className="error-copy">{detail.data.notification.lastError}</dd></>}</dl>
                      {retryError && <p className="retry-error" role="alert">{retryError}</p>}{retryNotice && <p className="retry-notice" role="status">{retryNotice}</p>}
                    </div>
                  </>}
                </aside>
              )}
            </section>
            <div className="admin-footnote"><span>Organizer access is monitored.</span><span>Registration data is confidential.</span></div>
          </>
        )}
        <a href="/" className="admin-back"><ArrowLeft size={14} /> Back to TREASURE 2026</a>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: NotificationStatus }) {
  return <span className={`status-pill status-${status}`}><i />{statusLabel[status]}</span>;
}
