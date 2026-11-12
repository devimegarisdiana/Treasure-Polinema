import { useState, type FormEvent } from 'react';

export default function ChangeParticipantPassword({ onChange, onSignOut }: {
  onChange: (data: { currentPassword: string; newPassword: string }) => Promise<unknown>;
  onSignOut: () => Promise<unknown>;
}) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (newPassword.length < 12 || newPassword.length > 128) { setError('Use 12–128 characters for your new password.'); return; }
    if (newPassword !== confirmation) { setError('New passwords do not match.'); return; }
    if (newPassword === currentPassword) { setError('Choose a password different from the temporary password.'); return; }
    setBusy(true);
    try { await onChange({ currentPassword, newPassword }); setCurrent(''); setNew(''); setConfirmation(''); }
    catch (cause) { setError((cause as { data?: { error?: string } })?.data?.error || 'Password change could not be confirmed. Try signing in with your new password before retrying.'); }
    finally { setBusy(false); }
  }
  return <section className="pt-card" data-testid="required-password-change" aria-labelledby="change-password-title">
    <h2 id="change-password-title">Set your personal password</h2>
    <p>Your organizer issued a temporary password. Set a new password before accessing your registration.</p>
    <form onSubmit={submit}>
      <div className="reg-field"><label htmlFor="temporary-password">Current temporary password</label><input id="temporary-password" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required maxLength={128} disabled={busy} /></div>
      <div className="reg-field"><label htmlFor="new-participant-password">New password</label><input id="new-participant-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNew(e.target.value)} required minLength={12} maxLength={128} disabled={busy} /><small>Use 12–128 characters.</small></div>
      <div className="reg-field"><label htmlFor="confirm-participant-password">Confirm new password</label><input id="confirm-participant-password" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required minLength={12} maxLength={128} disabled={busy} /></div>
      {error && <p className="reg-err" role="alert">{error}</p>}
      <button className="reg-btn reg-yellow" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>{' '}
      <button className="reg-btn reg-ghost" type="button" disabled={busy} onClick={() => { setBusy(true); void onSignOut().catch(() => setError('Sign-out could not be confirmed. Please retry.')).finally(() => setBusy(false)); }}>Sign out</button>
    </form>
  </section>;
}
