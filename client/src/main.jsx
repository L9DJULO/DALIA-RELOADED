import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Apply Soul Eater tokens on boot
document.documentElement.dataset.accent = localStorage.getItem('dalia_accent') || 'red';
document.documentElement.dataset.intensity = localStorage.getItem('dalia_intensity') || '10';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
