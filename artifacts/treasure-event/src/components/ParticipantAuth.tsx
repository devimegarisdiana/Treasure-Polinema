import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';

type AuthUser = { id: string; username: string; email: string };
type Props = {
  user: AuthUser | null;
  loading: boolean;
  checking: boolean;
  sessionError: boolean;
  expired?: boolean;
  busy: boolean;
  onSignUp: (data: { username: string; email: string; password: string }) => Promise<unknown>;
  onSignIn: (data: { identifier: string; password: string }) => Promise<unknown>;
  onSignOut: () => Promise<unknown>;
  onRetry: () => Promise<unknown>;
};

const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readableError(error: unknown) {
  const data = (error as { data?: { error?: unknown; message?: unknown }; message?: unknown } | null);
  const message = data?.data?.error ?? data?.data?.message ?? data?.message;
  if (typeof message === 'string' && message.length < 220) return message;
  return 'We could not complete that sign-in. Check your details and try again.';
}

export default function ParticipantAuth({
  user, loading, checking, sessionError, expired, busy, onSignUp, onSignIn, onSignOut, onRetry,
}: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (expired) {
      setMode('signin');
      setError('Your session expired. Sign in again to continue; your registration entries remain here.');
    }
  }, [expired]);

  const usernameError = !username.trim() ? 'Enter a username.' : !usernamePattern.test(username.trim())
    ? 'Use 3–30 letters, numbers, dots, underscores or hyphens. Start with a letter or number.' : '';
  const emailError = !email.trim() ? 'Enter your email address.' : !emailPattern.test(email.trim()) || email.length > 254
    ? 'Enter a valid email address.' : '';
  const passwordError = password.length < 12 ? 'Use at least 12 characters.' : password.length > 128
    ? 'Use no more than 128 characters.' : '';
  const confirmationError = confirmation !== password ? 'Passwords do not match.' : '';
  const identifierError = !identifier.trim() ? 'Enter your username or email.' : '';
  const signInPasswordError = !password ? 'Enter your password.' : '';
  const isSignup = mode === 'signup';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setError('');
    const invalid = isSignup
      ? Boolean(usernameError || emailError || passwordError || confirmationError)
      : Boolean(identifierError || signInPasswordError);
    if (invalid) return;
    try {
      if (isSignup) {
        await onSignUp({ username: username.trim(), email: email.trim(), password });
      } else {
        await onSignIn({ identifier: identifier.trim(), password });
      }
      setError('');
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(readableError(cause));
    }
  };

  if (loading) {
    return <section className="reg-gate reg-auth-loading" role="status" aria-live="polite" data-testid="status-auth-loading">
      <p>Checking your participant account…</p><div className="reg-skel" />
    </section>;
  }

  if (user && !expired) {
    return <section className={`reg-participant-session${expired ? ' is-expired' : ''}`} aria-label="Participant account">
      <div className="reg-session-mark"><UserRound size={17} aria-hidden="true" /></div>
      <div className="reg-session-copy">
        <span className="reg-session-label">{expired ? 'Session needs attention' : 'Participant account'}</span>
        <strong data-testid="text-identity">{user.username}</strong>
        <span>{user.email}</span>
      </div>
      <button type="button" className="reg-btn reg-ghost" disabled={busy} onClick={() => void onSignOut().catch((cause) => setError(readableError(cause)))} data-testid="button-logout">
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error && <span className="reg-err reg-session-error" role="alert">{error}</span>}
    </section>;
  }

  return <section className="reg-gate" data-testid="gate-login" aria-labelledby="participant-auth-title">
    <div className="reg-auth-head">
      <span className="reg-auth-icon"><LockKeyhole size={19} aria-hidden="true" /></span>
      <div>
        <div className="reg-auth-kicker">Private participant access</div>
        <h2 id="participant-auth-title">{expired ? 'Sign in to continue' : 'Your team starts here.'}</h2>
      </div>
    </div>
    <p className="reg-auth-intro">Create a participant account or sign in to keep your team details and uploaded documents private.</p>
    {sessionError && <div className="reg-alert" role="alert">
      We could not check your session. Try again before continuing.
      <button type="button" className="reg-btn reg-yellow reg-auth-retry" onClick={() => void onRetry()} disabled={checking} data-testid="button-retry-session">
        {checking ? 'Checking…' : 'Try again'}
      </button>
    </div>}
    <div className="reg-auth-tabs" role="tablist" aria-label="Participant account access">
      <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setAttempted(false); setPassword(''); }} data-testid="tab-create-account">Create account</button>
      <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setAttempted(false); setPassword(''); }} data-testid="tab-sign-in">Sign in</button>
    </div>
    {error && <div className="reg-alert" role="alert" data-testid="text-auth-error">{error}</div>}
    <form className="reg-auth-form" onSubmit={submit} noValidate>
      {isSignup ? <>
        <div className="reg-field">
          <label htmlFor="participant-username">Username *</label>
          <input id="participant-username" type="text" autoComplete="username" value={username} maxLength={30}
            onChange={(event) => setUsername(event.target.value)} aria-invalid={attempted && !!usernameError || undefined}
            aria-describedby={attempted && usernameError ? 'participant-username-error' : 'participant-username-hint'} data-testid="input-participant-username" />
          <span className="reg-hint" id="participant-username-hint">3–30 characters · letters, numbers, . _ -</span>
          {attempted && usernameError && <span className="reg-err" id="participant-username-error" role="alert">{usernameError}</span>}
        </div>
        <div className="reg-field">
          <label htmlFor="participant-email">Email address *</label>
          <input id="participant-email" type="email" autoComplete="email" value={email} maxLength={254}
            onChange={(event) => setEmail(event.target.value)} aria-invalid={attempted && !!emailError || undefined}
            aria-describedby={attempted && emailError ? 'participant-email-error' : undefined} data-testid="input-participant-email" />
          {attempted && emailError && <span className="reg-err" id="participant-email-error" role="alert">{emailError}</span>}
        </div>
      </> : <div className="reg-field">
        <label htmlFor="participant-identifier">Username or email *</label>
        <input id="participant-identifier" type="text" autoComplete="username" value={identifier}
          onChange={(event) => setIdentifier(event.target.value)} aria-invalid={attempted && !!identifierError || undefined}
          aria-describedby={attempted && identifierError ? 'participant-identifier-error' : undefined} data-testid="input-participant-identifier" />
        {attempted && identifierError && <span className="reg-err" id="participant-identifier-error" role="alert">{identifierError}</span>}
      </div>}
      <div className="reg-field">
        <label htmlFor="participant-password">Password *</label>
        <div className="reg-password-wrap">
          <input id="participant-password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} maxLength={128}
            onChange={(event) => setPassword(event.target.value)} aria-invalid={attempted && !!(isSignup ? passwordError : signInPasswordError) || undefined}
            aria-describedby={attempted && (isSignup ? passwordError : signInPasswordError) ? 'participant-password-error' : isSignup ? 'participant-password-hint' : undefined}
            data-testid="input-participant-password" />
          <button type="button" className="reg-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((visible) => !visible)} data-testid="button-toggle-password">
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {isSignup && <span className="reg-hint" id="participant-password-hint">12–128 characters. Keep it private.</span>}
        {attempted && (isSignup ? passwordError : signInPasswordError) && <span className="reg-err" id="participant-password-error" role="alert">{isSignup ? passwordError : signInPasswordError}</span>}
      </div>
      {isSignup && <div className="reg-field">
        <label htmlFor="participant-confirm-password">Confirm password *</label>
        <input id="participant-confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmation} maxLength={128}
          onChange={(event) => setConfirmation(event.target.value)} aria-invalid={attempted && !!confirmationError || undefined}
          aria-describedby={attempted && confirmationError ? 'participant-confirm-error' : undefined} data-testid="input-participant-confirm-password" />
        {attempted && confirmationError && <span className="reg-err" id="participant-confirm-error" role="alert">{confirmationError}</span>}
      </div>}
      <button type="submit" className="reg-btn reg-primary" disabled={busy} aria-busy={busy} data-testid="button-participant-auth">
        {busy ? 'Please wait…' : isSignup ? 'Create participant account' : 'Sign in and continue'}
      </button>
    </form>
    <p className="reg-auth-foot">No email verification or password reset is part of this registration journey.</p>
  </section>;
}
