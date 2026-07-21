import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import App from './App';
import { SITE_BRANDING } from './siteBranding';
import './styles.css';

if (typeof document !== 'undefined' && SITE_BRANDING.iconSrc) {
  const faviconLink =
    document.getElementById('app-favicon')
    ?? document.querySelector('link[rel="icon"]');

  if (faviconLink) {
    faviconLink.setAttribute('href', SITE_BRANDING.iconSrc);

    if (!faviconLink.getAttribute('type')) {
      faviconLink.setAttribute('type', 'image/svg+xml');
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss={false}
      draggable
      pauseOnHover={false}
    />
    <App />
  </React.StrictMode>
);
