import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import ServerGate from './ServerGate';

createRoot(document.getElementById('root')!).render(<StrictMode><ServerGate><App /></ServerGate></StrictMode>);
