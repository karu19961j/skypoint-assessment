import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort safety net: a render-time throw anywhere below this boundary
 * shows a recoverable error card instead of a blank page. Production
 * deployments would also call out to the error-tracking SDK from
 * `componentDidCatch` — left as a TODO since we don't have one wired up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logging to console is the bare minimum; a real product would forward
    // to Sentry / Datadog / etc. here.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-12 max-w-lg">
        <div role="alert" className="card border border-rose-200">
          <h1 className="text-lg font-semibold text-rose-800">Something went wrong</h1>
          <p className="mt-1 text-sm text-slate-600">
            The screen hit an unexpected error. You can try again, or reload
            the page if it keeps happening.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-500">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button onClick={this.reset} className="btn-primary text-sm">
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
