/**
 * GazeConnect Pro - Error Boundary
 * =================================
 * Crash-resilient wrapper with gaze-accessible recovery UI.
 * Emergency button renders OUTSIDE this boundary in App.tsx.
 */

import React from 'react';
import { darkColors, lightColors } from '../../utils/design';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
  onNavigateHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('GazeConnect ErrorBoundary caught:', error, errorInfo);
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    this.props.onNavigateHome?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const colors = this.props.isDarkMode !== false ? darkColors : lightColors;

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: colors.background.primary,
          padding: '40px',
          gap: '24px',
        }}>
          {/* Error icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: `3px solid ${colors.warning.main}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke={colors.warning.main} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2 style={{
            fontSize: '28px', fontWeight: 700,
            color: colors.text.primary, textAlign: 'center',
          }}>
            Something went wrong
          </h2>

          <p style={{
            fontSize: '18px', color: colors.text.secondary,
            textAlign: 'center', maxWidth: '500px', lineHeight: 1.5,
          }}>
            A screen encountered an error. Your data is safe.
            Use the buttons below to recover.
          </p>

          {this.state.error && (
            <pre style={{
              fontSize: '13px', color: colors.text.tertiary || '#6B7280',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: `1px solid ${colors.border.main}`,
              borderRadius: '8px',
              padding: '12px 16px',
              maxWidth: '600px',
              maxHeight: '120px',
              overflow: 'auto',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
            {/* Return Home button - large, gaze-friendly */}
            <button
              onClick={this.handleGoHome}
              data-gaze="true"
              data-gaze-always="true"
              style={{
                padding: '20px 48px',
                minWidth: '180px', minHeight: '80px',
                backgroundColor: colors.accent.main,
                border: 'none', borderRadius: '16px',
                color: '#fff', fontSize: '20px', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 4px 20px ${colors.accent.main}40`,
              }}
            >
              Return Home
            </button>

            {/* Reload button */}
            <button
              onClick={this.handleReload}
              data-gaze="true"
              data-gaze-always="true"
              style={{
                padding: '20px 48px',
                minWidth: '180px', minHeight: '80px',
                backgroundColor: 'transparent',
                border: `2px solid ${colors.border.main}`,
                borderRadius: '16px',
                color: colors.text.primary, fontSize: '20px', fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
