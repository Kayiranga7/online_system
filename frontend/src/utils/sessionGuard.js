/**
 * Guards the one place the app fetches a new access token outside the axios
 * interceptor: the Socket.IO reconnect handler.
 *
 * Socket.IO retries a failed handshake on its own schedule, so a session that
 * cannot be refreshed (expired refresh cookie, wrong JWT secret after a
 * redeploy) previously produced a new /api/auth/refresh request on every retry
 * - roughly one every few seconds, forever, which also fills the server log.
 * The guard bounds that: at most one attempt per interval, and after a few
 * fruitless attempts the caller gives up (logs out) instead of spinning.
 */

/**
 * Reads the exp claim without verifying the signature. The token already came
 * from our own backend; this only decides whether asking for a new one could
 * possibly help. A malformed or missing token counts as expired.
 */
export function isTokenExpired(token, now = Date.now()) {
  if (!token || typeof token !== 'string') return true;
  const part = token.split('.')[1];
  if (!part) return true;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) return true;
    return payload.exp * 1000 <= now;
  } catch {
    return true;
  }
}

/**
 * Returns 'ok' (attempt now), 'wait' (too soon after the last attempt) or
 * 'stop' (attempts exhausted - give up and log out).
 */
export function createRefreshGuard({ minIntervalMs = 30000, maxAttempts = 3 } = {}) {
  // null (not 0) means "no attempt yet": comparing against 0 would make the
  // very first attempt look too recent whenever the caller passes a clock that
  // starts near zero.
  let lastAttempt = null;
  let attempts = 0;
  return {
    check(now = Date.now()) {
      if (attempts >= maxAttempts) return 'stop';
      if (lastAttempt !== null && now - lastAttempt < minIntervalMs) return 'wait';
      lastAttempt = now;
      attempts += 1;
      return 'ok';
    },
    // A successful refresh (or a healthy reconnect) clears the budget.
    succeeded() {
      attempts = 0;
      lastAttempt = null;
    },
    get attempts() {
      return attempts;
    },
  };
}
