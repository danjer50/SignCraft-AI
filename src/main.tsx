import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

/** Guarantees a mount node exists so a broken document can never leave a blank screen. */
function resolveMountNode(): HTMLElement {
  const existing = document.getElementById('root');
  if (existing) return existing;
  const created = document.createElement('div');
  created.id = 'root';
  document.body.append(created);
  return created;
}

ReactDOM.createRoot(resolveMountNode()).render(
  <React.StrictMode>
    <ErrorBoundary variant="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
