import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installErrorMonitoring } from './error-monitoring.ts'
import { ToastProvider } from './components/Toast.tsx'

class DesktopErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() { return { hasError: true }; }

  componentDidCatch(error: Error) { console.error('Desktop render error:', error); }

  render() {
    if (this.state.hasError) return <div className="desktop-crash-fallback" role="alert">Something went wrong. Please reload the application and try again.</div>;
    return this.props.children;
  }
}

installErrorMonitoring()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider lang={(localStorage.getItem('pos_language') as 'en' | 'ar') || 'ar'}><DesktopErrorBoundary><App /></DesktopErrorBoundary></ToastProvider>
  </StrictMode>,
)
