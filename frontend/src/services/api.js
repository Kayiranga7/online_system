import axios from 'axios';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send httpOnly refresh-token cookie
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
      if (!refreshing) {        refreshing = axios.post(`${API_BASE_URL}/auth/refresh`,
          {},
                  { withCredentials: true }
                  )
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
