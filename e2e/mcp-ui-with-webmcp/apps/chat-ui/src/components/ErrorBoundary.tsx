import * as Sentry from '@sentry/react';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  isDetailsOpen: boolean;
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
      isDetailsOpen: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    // Capture error in Sentry with React component stack context
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

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
      isDetailsOpen: false,
    });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({
      isDetailsOpen: !prev.isDetailsOpen,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background sm:p-6">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 space-y-1">
                  <CardTitle className="text-xl">Something went wrong</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    We encountered an unexpected error. You can try refreshing the page or resetting
                    the application.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>Error Message</AlertTitle>
                <AlertDescription>
                  {this.state.error?.message || 'An unexpected error occurred'}
                </AlertDescription>
              </Alert>

              {this.state.errorInfo && (
                <Collapsible open={this.state.isDetailsOpen} onOpenChange={this.toggleDetails}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                      aria-label="Toggle error details"
                    >
                      <span className="text-sm font-medium">Technical Details</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          this.state.isDetailsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="rounded-lg border bg-muted/50 p-4">
                      <pre className="overflow-x-auto text-xs leading-relaxed text-foreground">
                        <code>
                          {this.state.error?.stack}
                          {'\n\n'}
                          {'Component Stack:'}
                          {this.state.errorInfo.componentStack}
                        </code>
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button onClick={this.handleReset} className="w-full sm:w-auto">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto"
              >
                Reload Page
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
