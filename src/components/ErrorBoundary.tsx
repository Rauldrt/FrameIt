import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  // Explicitly declared to satisfy strict environment or specific compiler versions
  public state: State;
  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      errorMsg: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    let msg = error.message;
    try {
      const parsed = JSON.parse(msg);
      if (parsed.error) msg = parsed.error;
    } catch(e) {}
    return { hasError: true, errorMsg: msg };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 text-white p-6">
          <div className="max-w-md w-full bg-stone-800 p-6 rounded-2xl border border-red-500/50 shadow-2xl space-y-4">
            <h1 className="text-xl font-bold text-red-400">Oops, algo salió mal</h1>
            <p className="text-stone-300 text-sm break-words">{this.state.errorMsg}</p>
            <button
              className="px-4 py-2 bg-stone-700 hover:bg-stone-600 rounded-lg text-sm font-medium transition-colors"
              onClick={() => window.location.href = '/'}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
