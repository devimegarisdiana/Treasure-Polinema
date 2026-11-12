import { useEffect, useState } from 'react';
import { getGetRegistrationParticipantAccountQueryKey, useGetRegistrationParticipantAccount, resetRegistrationPassword } from '@workspace/api-client-react';

const message = (e: unknown) => {
  const text = (e as { data?: { error?: string } })?.data?.error;
  return text || 'The request could not be confirmed. Reload the account before trying another reset.';
};

export default function ParticipantPasswordRecovery({ registrationId }: { registrationId: string }) {
  const account = useGetRegistrationParticipantAccount(registrationId, { query: { queryKey: getGetRegistrationParticipantAccountQueryKey(registrationId), retry: false, refetchOnMount: 'always' } });
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<{ username: string; temporaryPassword: string; expiresAt: string } | null>(null);
  useEffect(() => {
    if (!secret) return;
    const timer = window.setTimeout(() => setSecret(null), 10 * 60_000);
    return () => window.clearTimeout(timer);
  }, [secret]);

  async function reset() {
    if (!account.data?.account || pending) return;
    setPending(true);
    setError('');
    setSecret(null);
    try {
      // Direct generated request: never put the one-time password in a query/mutation cache.
      const result = await resetRegistrationPassword(registrationId, { accountId: account.data.account.id, confirmed: true });
      setSecret(result);
      setConfirming(false);
      void account.refetch();
    } catch (cause) { setError(message(cause)); }
    finally { setPending(false); }
  }

  return <section className="detail-section" aria-labelledby="participant-recovery-title" data-testid="participant-password-recovery">
    <h3 id="participant-recovery-title">Participant account</h3>
    {account.isLoading ? <p role="status">Loading linked account…</p> : account.isError ? <>
      <p role="alert">The linked account could not be loaded.</p>
      <button className="retry-button" type="button" onClick={() => void account.refetch()}>Retry account lookup</button>
    </> : !account.data?.account ? <p>No native participant account is linked to this record. Reset is unavailable; contact email is not proof of account ownership.</p> : <>
      <dl><dt>Username</dt><dd data-testid="recovery-username">{account.data.account.username}</dd><dt>Account email</dt><dd>{account.data.account.email}</dd><dt>Password status</dt><dd>{account.data.account.mustChangePassword ? 'Must change temporary password' : 'Personal password set'}</dd></dl>
      {secret ? <div className="recovery-secret" role="status">
        <strong>Temporary password — shown only now</strong>
        <p>For <b>{secret.username}</b>. Share privately with the verified participant.</p>
        <code data-testid="temporary-password">{secret.temporaryPassword}</code>
        <p>Valid until {new Date(secret.expiresAt).toLocaleString('en-GB')}. The participant must set a new password after signing in. This display hides automatically after 10 minutes.</p>
        <button type="button" className="retry-button" onClick={() => setSecret(null)}>Hide password</button>
      </div> : confirming ? <div className="recovery-confirm" role="group" aria-label="Confirm password reset">
        <p>Reset the account <b>{account.data.account.username}</b>? This signs it out on all devices and affects every team owned by this account. Verify the participant’s identity before sharing the temporary password. Registration records and documents will not change.</p>
        <button type="button" className="retry-button" disabled={pending} onClick={() => void reset()}>{pending ? 'Resetting…' : 'Confirm reset'}</button>{' '}
        <button type="button" className="retry-button" disabled={pending} onClick={() => { setConfirming(false); setError(''); }}>Cancel</button>
      </div> : <button type="button" className="retry-button" onClick={() => { setConfirming(true); setError(''); }}>Reset password</button>}
      {error && <p className="retry-error" role="alert">{error}</p>}
    </>}
  </section>;
}
