import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PoliPolicy UI ErrorBoundary caught error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  handleReturnHome = () => {
    this.setState({ hasError: false, message: '' });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto font-display font-bold text-lg">
              PP
            </div>
            <h1 className="font-display text-xl font-bold text-[#0E1A40]">
              PoliPolicy encountered a display issue
            </h1>
            <p className="text-sm text-[#475569] leading-relaxed">
              {this.state.message ||
                'Your session and records are safe. Reload the view or return to the home page.'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Reload View
              </button>
              <button
                type="button"
                onClick={this.handleReturnHome}
                className="px-4 py-2.5 bg-white border border-[#CBD5E1] hover:border-[#2563EB] text-[#0E1A40] text-sm font-semibold rounded-lg transition-colors"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
