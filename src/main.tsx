import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_LOOK } from './config/look';

// The look is chosen once, before the first paint (src/config/look.ts).
document.documentElement.dataset.look = APP_LOOK;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
