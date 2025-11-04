import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary component to catch and display React errors
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <h1 className="error-boundary-title">Oops! Something went wrong</h1>
            <p className="error-boundary-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {this.state.errorInfo && (
              <details className="error-boundary-details">
                <summary>Error Details</summary>
                <pre className="error-boundary-stack">
                  {this.state.error?.stack}
                  {'\n\nComponent Stack:'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <button className="error-boundary-reset-button" onClick={this.handleReset}>
              Try Again
            </button>
          </div>

          <style>{`
            .error-boundary-container {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1.5rem;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }

            .error-boundary-content {
              max-width: 600px;
              background: white;
              border-radius: 12px;
              padding: 2rem;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            }

            @media (prefers-color-scheme: dark) {
              .error-boundary-content {
                background: #1a1a1a;
                color: #e0e0e0;
              }
            }

            .error-boundary-title {
              margin: 0 0 1rem 0;
              font-size: 1.75rem;
              font-weight: 700;
              color: #d32f2f;
            }

            @media (prefers-color-scheme: dark) {
              .error-boundary-title {
                color: #f44336;
              }
            }

            .error-boundary-message {
              margin: 0 0 1.5rem 0;
              font-size: 1rem;
              line-height: 1.5;
              color: #333;
            }

            @media (prefers-color-scheme: dark) {
              .error-boundary-message {
                color: #b0b0b0;
              }
            }

            .error-boundary-details {
              margin-bottom: 1.5rem;
              padding: 1rem;
              background: #f5f5f5;
              border-radius: 8px;
              border: 1px solid #e0e0e0;
            }

            @media (prefers-color-scheme: dark) {
              .error-boundary-details {
                background: #2a2a2a;
                border-color: #444;
              }
            }

            .error-boundary-details summary {
              cursor: pointer;
              font-weight: 600;
              margin-bottom: 0.5rem;
              user-select: none;
            }

            .error-boundary-details summary:hover {
              color: #667eea;
            }

            .error-boundary-stack {
              margin: 0.5rem 0 0 0;
              padding: 1rem;
              background: #fff;
              border-radius: 4px;
              overflow-x: auto;
              font-size: 0.75rem;
              line-height: 1.4;
              color: #d32f2f;
            }

            @media (prefers-color-scheme: dark) {
              .error-boundary-stack {
                background: #1a1a1a;
                color: #f44336;
              }
            }

            .error-boundary-reset-button {
              padding: 0.75rem 1.5rem;
              font-size: 1rem;
              font-weight: 600;
              color: white;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border: none;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease;
              box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            }

            .error-boundary-reset-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }

            .error-boundary-reset-button:active {
              transform: translateY(0);
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}
