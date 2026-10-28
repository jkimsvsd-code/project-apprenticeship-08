import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './public-profile/profile.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing root');
createRoot(container).render(<App />);
