import axios from 'axios';

const configuredPortal = __BOOKLEAF_PORTAL__;
function currentPortal() {
  if (configuredPortal === 'author' || configuredPortal === 'admin') return configuredPortal;
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'author';
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
});

let csrfToken = '';
let csrfRecovery = null;
export function setCsrfToken(token) { csrfToken = token || ''; }

api.interceptors.request.use((config) => {
  config.headers['X-BookLeaf-Portal'] = currentPortal();
  const method = (config.method || 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method) && csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const apiError = error.response?.data?.error;
    if (error.response?.status === 403 && apiError?.code === 'CSRF_INVALID' && request &&
        !request._csrfRetried && !String(request.url || '').includes('/auth/csrf')) {
      request._csrfRetried = true;
      try {
        if (!csrfRecovery) {
          csrfRecovery = api.get('/auth/csrf', { params: { role: currentPortal() } })
            .then((response) => response.data.data.csrfToken)
            .finally(() => { csrfRecovery = null; });
        }
        const freshToken = await csrfRecovery;
        setCsrfToken(freshToken);
        request.headers = request.headers || {};
        request.headers['X-CSRF-Token'] = freshToken;
        return api.request(request);
      } catch (_recoveryError) {
        // Preserve the original CSRF error for the UI if recovery is unavailable.
      }
    }
    const message = error.response?.data?.error?.message
      || (error.code === 'ECONNABORTED' ? 'The request timed out. Please try again.' : '')
      || (error.response ? 'Something went wrong. Please try again.' : 'Cannot reach BookLeaf Support. Check your connection and try again.');
    error.userMessage = message;
    return Promise.reject(error);
  }
);

export const errorMessage = (error) => error?.userMessage || 'Something went wrong. Please try again.';
