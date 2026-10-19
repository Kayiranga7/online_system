/**
 * Auth0 configuration for the SPA.
 *
 * Every value is optional: with any of the three missing, `isAuth0Configured`
 * is false, the SDK is never mounted and the "Continue with Auth0" buttons are
 * not rendered. Password login keeps working untouched.
 *
 * Like VITE_API_URL these are inlined at build time, so a deployed bundle only
 * picks them up when the build environment has them set.
 */
const rawDomain = (import.meta.env.VITE_AUTH0_DOMAIN || '').trim();

export const AUTH0_DOMAIN = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
export const AUTH0_CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID || '').trim();
export const AUTH0_AUDIENCE = (import.meta.env.VITE_AUTH0_AUDIENCE || '').trim();

export const isAuth0Configured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);

/** Must be registered under "Allowed Callback URLs" in the Auth0 application. */
export const AUTH0_CALLBACK_PATH = '/callback';

/** Session marker so logout only clears Auth0's session when it was used. */
export const AUTH0_SESSION_KEY = 'imizi:auth0';

export const auth0ProviderConfig = isAuth0Configured
  ? {
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
      authorizationParams: {
        audience: AUTH0_AUDIENCE,
        // offline_access asks for a refresh token so token renewal does not
        // depend on a third-party cookie inside a hidden iframe.
        scope: 'openid profile email offline_access',
        redirect_uri: `${window.location.origin}${AUTH0_CALLBACK_PATH}`,
      },
      useRefreshTokens: true,
      useRefreshTokensFallback: false,
      // Memory only: a reload falls back to the app's own httpOnly refresh
      // cookie, which is the session that actually matters.
      cacheLocation: 'memory',
    }
  : null;

/**
 * Ends the Auth0 SSO session as well as the local one. Without it, signing out
 * and clicking "Continue with Auth0" again would sign the same person straight
 * back in. The origin must be listed under "Allowed Logout URLs".
 */
export function auth0LogoutUrl() {
  const returnTo = encodeURIComponent(window.location.origin);
  return `https://${AUTH0_DOMAIN}/v2/logout?client_id=${encodeURIComponent(AUTH0_CLIENT_ID)}&returnTo=${returnTo}`;
}
