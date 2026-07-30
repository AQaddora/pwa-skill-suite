import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initErrorReporting } from './errorReporting.js';

initErrorReporting();

createRoot(document.getElementById('root')).render(<App />);
