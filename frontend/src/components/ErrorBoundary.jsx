import React from 'react';

/**
 * Top-level React error boundary.
 *
 * Without this, an uncaught render error in any view blanks the
 * whole webview — the user sees a white screen and has to force-quit
 * the app. With it, we render a graceful fallback that explains
 * what happened and offers a hard refresh.
 *
 * Class component because React's hooks API doesn't expose
 * componentDidCatch. Wraps the router so view-level crashes are
 * caught at the same level network/auth crashes already are.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // In dev this shows in DevTools; in prod the JSON-logging backend
    // catches the equivalent via Sentry once it's wired (audit-medium
    // followup). Don't include the user-facing fallback in this log.
    if (typeof console !== 'undefined' && console.error) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  handleReset = () => {
    // Hard reload — drops the broken React tree, re-runs auth checks
    // and any data fetches from scratch. Safer than trying to recover
    // the failing component in-place.
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-xl font-semibold">Something broke on this screen</h1>
            <p className="text-sm text-muted-foreground">
              StudyPartner ran into an unexpected error. Your data is safe —
              reload to try again.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Reload
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-left text-xs bg-muted p-3 rounded-md overflow-x-auto">
                {String(this.state.error?.stack || this.state.error)}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
