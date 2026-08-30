import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the error message to help pinpoint which part crashed. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/effect errors in its subtree and shows a visible message
 * instead of letting the whole app go blank.
 *
 * Without this, any unhandled exception thrown while rendering a tab
 * (for example ipcService calling into a preload API that isn't ready yet)
 * unmounts the entire React tree with no on-screen indication of why.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="card border border-red-300 bg-red-50 text-red-800 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium">
                {this.props.label ? `Ошибка во вкладке «${this.props.label}»` : 'Произошла ошибка'}
              </p>
              <p className="text-xs text-red-700 break-words">{error.message}</p>
              <button
                className="btn-secondary text-xs"
                onClick={this.handleRetry}
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
