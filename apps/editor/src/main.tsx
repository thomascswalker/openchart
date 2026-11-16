import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@openchart/core/styles.css';

import App from './App.tsx';
import { bootstrap } from './bootstrap';
import './components/styles.css';

bootstrap();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
