import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  withCredentials: true,
});

// Attach access token from memory on every request
api.interceptors.request.use((config) => {
  const token = window.__imiziAccessToken;
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

let refreshing = null;

// On 401 TOKEN_EXPIRED, attempt a silent refresh once then retry
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = axios.post('/api/auth/refresh', {}, { withCredentials: true })
          .then((r) => {
            window.__imiziAccessToken = r.data.accessToken;
            refreshing = null;
          })
          .catch(() => {
            window.__imiziAccessToken = null;
            refreshing = null;
            window.dispatchEvent(new Event('imizi:logout'));
          });
      }
      await refreshing;
      if (window.__imiziAccessToken) {
        original.headers['Authorization'] = `Bearer ${window.__imiziAccessToken}`;
        return api(original);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
