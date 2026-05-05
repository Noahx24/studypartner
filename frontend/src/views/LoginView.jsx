import { useEffect, useState } from 'react';
import { api, auth } from '../api/client';
import { Icon } from '../ui/Icon';
import { P, MONO } from '../ui/tokens';

/**
 * Sign-in screen. Renders the "Continue with Microsoft" CTA. If the
 * backend reports that Microsoft auth isn't configured (local/dev), we
 * fall back to a simple email field that hits /auth/microsoft/dev so
 * developers can still get into the app without Azure AD.
 */
export function LoginView({ onSignedIn }) {
  const [configured, setConfigured] = useState(true);
  const [authorizeUrl, setAuthorizeUrl] = useState(null);
  const [devEmail, setDevEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // 1) When the backend redirects us back from Microsoft, the token is
  //    in the URL fragment as `#auth_token=…`. Pick it up, store it,
  //    clear the fragment, then load /auth/me.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes('auth_token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('auth_token');
    if (!token) return;
    auth.set(token);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    api.authMe()
      .then((res) => onSignedIn(res.user))
      .catch((err) => setError(err.message));
  }, [onSignedIn]);

  // 2) Probe the backend for the authorize URL + whether real Azure is wired.
  useEffect(() => {
    api.authStart()
      .then((res) => {
        setConfigured(res.configured);
        setAuthorizeUrl(res.authorize_url);
      })
      .catch((err) => setError(err.message));
  }, []);

  const onMicrosoftClick = () => {
    if (!authorizeUrl) return;
    window.location.assign(authorizeUrl);
  };

  const onDevSignIn = async (event) => {
    event.preventDefault();
    if (!devEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.authDevSignIn({ email: devEmail.trim() });
      auth.set(res.auth_token);
      onSignedIn(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-6 pb-10 pt-[88px]"
      style={{ background: P.bg }}
    >
      <span className="mono text-[11px] font-bold uppercase tracking-wider text-ink3" style={{ fontFamily: MONO }}>
        StudyPartner
      </span>
      <h1 className="mt-2 text-[34px] font-bold leading-[1.05] tracking-tightest text-ink">
        Sign in with your school account
      </h1>
      <p className="mt-3 text-[15px] leading-[1.5] text-ink2">
        Use the same Microsoft email you use for Moodle (e.g.{' '}
        <span className="mono" style={{ fontFamily: MONO }}>10520467@mylife.unisa.ac.za</span>).
        We'll auto-import your modules and deadlines.
      </p>

      {error && (
        <div
          className="mt-5 rounded-card px-3 py-2 text-[13px]"
          style={{ background: P.coralSoft, color: P.coralDeep }}
        >
          {error}
        </div>
      )}

      <button
        onClick={onMicrosoftClick}
        disabled={!authorizeUrl || !configured}
        className="mt-8 flex items-center justify-center gap-3 rounded-card px-5 py-4 text-[15px] font-semibold transition-transform active:scale-[0.99] disabled:opacity-50"
        style={{ background: P.ink, color: P.surface }}
      >
        <MicrosoftLogo />
        Continue with Microsoft
      </button>

      {!configured && (
        <div className="mt-8">
          <div
            className="mb-3 rounded-card px-3 py-2 text-[12px]"
            style={{ background: P.surface, border: `1px solid ${P.line}`, color: P.ink2 }}
          >
            Microsoft sign-in isn't configured on this server.
            Use the dev shortcut below.
          </div>
          <form onSubmit={onDevSignIn} className="space-y-3">
            <input
              type="email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="10520467@mylife.unisa.ac.za"
              className="w-full rounded-card px-4 py-3 text-[15px]"
              style={{ background: P.surface, border: `1px solid ${P.line}`, color: P.ink }}
            />
            <button
              type="submit"
              disabled={busy || !devEmail.trim()}
              className="w-full rounded-card px-5 py-4 text-[15px] font-semibold disabled:opacity-50"
              style={{ background: P.ink, color: P.surface }}
            >
              {busy ? 'Signing in…' : 'Continue (dev mode)'}
            </button>
          </form>
        </div>
      )}

      <p className="mt-auto pt-10 text-center text-[12px] text-ink3">
        We never see your Microsoft password — Microsoft signs you in,
        then we link your school email to your StudyPartner account.
      </p>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F35325" />
      <rect x="12" y="1" width="9" height="9" fill="#81BC06" />
      <rect x="1" y="12" width="9" height="9" fill="#05A6F0" />
      <rect x="12" y="12" width="9" height="9" fill="#FFBA08" />
    </svg>
  );
}
