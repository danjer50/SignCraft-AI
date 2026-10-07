import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorScreen';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Any change clears a rendered error, so navigating away from a broken page recovers the
   * app instead of leaving the crash screen in place.
   */
  resetKey?: string;
  /** `root` is used outside the router and providers; `page` keeps the site chrome visible. */
  variant?: 'page' | 'root';
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Application-level guard: a rendering error anywhere in the tree shows a localized,
 * actionable recovery screen instead of unmounting everything into a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept client-side only: no crash data leaves the browser.
    console.error('SignCraft AI recovered from a rendering error', error, info.componentStack);
  }

  private readonly retry = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} variant={this.props.variant ?? 'page'} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
