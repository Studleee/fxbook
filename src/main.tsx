import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme';
import './index.css';
import './terminal.css';

class DeskErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="terminal" style={{ padding: 24 }}>
          <div style={{ color: '#ef5b67', letterSpacing: '0.12em', marginBottom: 12 }}>DESK ERROR</div>
          <pre style={{ color: '#d6dde6', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <DeskErrorBoundary>
    <App />
  </DeskErrorBoundary>,
);
