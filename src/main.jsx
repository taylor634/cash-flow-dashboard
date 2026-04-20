import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Lightweight storage shim so the dashboard works without a backend
window.storage = {
  _store: {},
  get: (key) => Promise.resolve(window.storage._store[key] ? { value: window.storage._store[key] } : null),
  set: (key, value) => { window.storage._store[key] = value; return Promise.resolve(); },
  delete: (key) => { delete window.storage._store[key]; return Promise.resolve(); },
};

// Persist to localStorage so data survives page refreshes
const _set = window.storage.set.bind(window.storage);
const _get = window.storage.get.bind(window.storage);
const _del = window.storage.delete.bind(window.storage);

window.storage.set = (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
  return _set(key, value);
};
window.storage.get = (key) => {
  const val = localStorage.getItem(key);
  if (val !== null) window.storage._store[key] = val;
  return _get(key);
};
window.storage.delete = (key) => {
  try { localStorage.removeItem(key); } catch {}
  return _del(key);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
