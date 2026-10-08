import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

interface OrganizerSignInProps {
  onSignIn: (credentials: { username: string; password: string }) => Promise<unknown>;
  busy: boolean;
  sessionChecking?: boolean;
  sessionError?: unknown;
  signinError?: unknown;
  onRetrySession?: () => void;
  onClearError?: () => void;
}

const errorMessage = (error: unknown) => {
  const body = (error as { data?: { error?: unknown; message?: unknown } } | null)?.data;
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.message === 'string') return body.message;
  return 'That username and password could not be verified. Check your details and try again.';
};

export function OrganizerSignIn({
  onSignIn, busy, sessionChecking = false, sessionError, signinError, onRetrySession, onClearError,
}: OrganizerSignInProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isBusy = busy || submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy || !username.trim() || !password) return;
    setFormError('');
    onClearError?.();
    setSubmitting(true);
    try {
      await onSignIn({ username: username.trim(), password });
      setPassword('');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      // The credential exists only in component memory while the form is active.
      setPassword('');
      setSubmitting(false);
    }
  };

  return (
    <section className="admin-gate admin-login-gate" data-testid="admin-login">
      <div className="gate-mark"><LockKeyhole size={21} /></div>
      <div className="login-overline"><ShieldCheck size={13} /> Organizer credentials</div>
      <h2>Sign in to continue</h2>
      <p>This workspace is restricted to authorized TREASURE organizers. Sign-in alone does not grant organizer access.</p>
      {sessionChecking && <div className="session-check" role="status"><span /><span /><p>Checking your organizer session…</p></div>}
      {!!sessionError && !sessionChecking && (
        <div className="login-alert" role="alert">
          <span>Your session could not be checked. Registration records remain hidden.</span>
          <button type="button" onClick={onRetrySession}>Retry session check</button>
        </div>
      )}
      <form className="organizer-login-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="organizer-username">Username</label>
        <div className="login-input-wrap"><KeyRound size={15} /><input
          id="organizer-username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={isBusy}
          data-testid="input-organizer-username"
        /></div>
        <label htmlFor="organizer-password">Password</label>
        <div className="login-input-wrap"><LockKeyhole size={15} /><input
          id="organizer-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isBusy}
          data-testid="input-organizer-password"
        /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} disabled={isBusy} data-testid="button-toggle-password">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
        {(formError || signinError) ? <p className="login-form-error" role="alert">{formError || errorMessage(signinError)}</p> : null}
        <button className="admin-primary login-submit" type="submit" disabled={isBusy || !username.trim() || !password} data-testid="button-organizer-signin">
          {isBusy ? <><span className="button-progress" /> Verifying credentials…</> : <>Sign in securely <ShieldCheck size={15} /></>}
        </button>
      </form>
      <div className="login-provisioning"><span /> Accounts are provisioned by TREASURE administrators. Organizer access is never granted through participant registration.</div>
    </section>
  );
}
