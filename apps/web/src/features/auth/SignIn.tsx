/**
 * Sign in, set password from an invite, forgot and reset (design/signin.html).
 * The prototype's Google and Microsoft buttons are replaced by email and password, which is
 * the decision recorded in docs/DECISIONS.md.
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiProblem } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, ErrorNote } from '../../components/ui.jsx';
import { Logo } from '../../components/AppShell.jsx';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="signin">
      <section className="hero">
        <div className="lockup">
          <Logo size={34} />
          <span className="t">
            <b>Repotra</b>
          </span>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <span className="eyebrow">Daily activity, weekly results</span>
          <h1>Log the day. Close the week. Keep the pipeline honest.</h1>
          <p className="muted" style={{ maxWidth: 440, fontSize: 16, lineHeight: 1.7 }}>
            Daily activity, weekly results, ABM accounts and backlog tasks for the whole team, in
            one place.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="card box stack" style={{ gap: 22, padding: 36 }}>
          {children}
        </div>
      </section>
    </div>
  );
}

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      navigate(user.role === 'contributor' ? '/' : '/admin', { replace: true });
    } catch (problem) {
      setError(problem instanceof ApiProblem ? problem.text : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 24 }}>Sign in</h2>
        <p className="small muted">
          Use your work account. Access is limited to invited people.
        </p>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <hr className="divider" />
      <div className="stack" style={{ gap: 4 }}>
        <span className="kicker">Daily log due</span>
        <span className="small">By 7pm India time on every working day</span>
      </div>
      <p className="xs faint">
        <Link to="/forgot">Forgotten your password?</Link> Trouble signing in? Ask Raphy to check
        your access.
      </p>
    </Frame>
  );
}

/** Both the invite link and the reset link land on a form of this shape. */
function ChoosePassword({
  heading,
  blurb,
  purpose,
}: {
  heading: string;
  blurb: string;
  purpose: 'invite' | 'reset';
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== again) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (purpose === 'invite') {
        const body = await api.post<{ user: { role: string } }>('/auth/accept-invite', {
          token,
          password,
        });
        setUser(body.user as never);
        navigate(body.user.role === 'contributor' ? '/' : '/admin', { replace: true });
      } else {
        await api.post('/auth/reset', { token, password });
        setDone(true);
      }
    } catch (problem) {
      setError(problem instanceof ApiProblem ? problem.text : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Frame>
        <h2 style={{ fontSize: 24 }}>That link is incomplete</h2>
        <p className="small muted">
          Open the link from your email again, or ask Raphy to send a new one.
        </p>
        <Link className="btn" to="/signin">
          Back to sign in
        </Link>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame>
        <h2 style={{ fontSize: 24 }}>Your password is changed</h2>
        <p className="small muted">You can sign in with it now.</p>
        <Link className="btn btn-primary btn-block" to="/signin">
          Sign in
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 24 }}>{heading}</h2>
        <p className="small muted">{blurb}</p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="hint">At least 12 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="again">Type it again</label>
          <input
            id="again"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save the password'}
        </button>
      </form>
    </Frame>
  );
}

export function SetPassword() {
  return (
    <ChoosePassword
      heading="Choose your password"
      blurb="This sets the password for your Repotra account."
      purpose="invite"
    />
  );
}

export function ResetPassword() {
  return (
    <ChoosePassword
      heading="Choose a new password"
      blurb="Pick something you have not used here before."
      purpose="reset"
    />
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    // The answer is the same whether or not the address has an account.
    await api.post('/auth/forgot', { email }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  };

  if (sent) {
    return (
      <Frame>
        <h2 style={{ fontSize: 24 }}>Check your email</h2>
        <p className="small muted">
          If that address has an account, a link to choose a new password is on its way. It works
          for one hour.
        </p>
        <Link className="btn" to="/signin">
          Back to sign in
        </Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ fontSize: 24 }}>Forgotten your password?</h2>
        <p className="small muted">Enter your work address and we will send you a link.</p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="forgot-email">Email address</label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send the link'}
        </button>
        <Link className="btn btn-ghost" to="/signin">
          Back to sign in
        </Link>
      </form>
    </Frame>
  );
}

/** Shown when an account has been switched off (docs/DESIGN.md). */
export function NoAccess() {
  return (
    <Frame>
      <h2 style={{ fontSize: 24 }}>Ask Raphy for access</h2>
      <p className="small muted">
        Your account is not active. Raphy can switch it back on from Settings.
      </p>
      <Button
        onClick={() => {
          window.location.href = '/signin';
        }}
      >
        Back to sign in
      </Button>
    </Frame>
  );
}
