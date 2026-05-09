import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Apply Soul Eater tokens on boot
document.documentElement.dataset.accent    = 'red';
document.documentElement.dataset.intensity = '10';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
