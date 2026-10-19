/**
 * Google Identity Services configuration for the SPA.
 *
 * The client id must be the same OAuth 2.0 Web client the API verifies tokens
 * against (`GOOGLE_CLIENT_ID` on the backend), and the site's origin has to be
 * listed under "Authorized JavaScript origins" for that client.
 *
 * Like VITE_API_URL this value is inlined at build time: a deployed bundle only
 * sees it when the build environment sets it. When it is missing the Google
 * button is never rendered and password/Auth0 login are untouched.
 */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

const SCRIPT_ID = 'imizi-google-identity';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loading = null;

/**
 * Loads Google's GIS library once, on demand. Only the login/register screens
 * ask for it, so the rest of the app never pays for the extra request.
 */
export function loadGoogleIdentity() {
  if (!isGoogleConfigured) {
    return Promise.reject(new Error('Google sign-in is not configured.'));
  }
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);

  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const fail = (message) => {
      loading = null;
      reject(new Error(message));
    };
    const ready = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else fail('Google sign-in is unavailable.');
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', ready);
      existing.addEventListener('error', () => fail('Could not load Google sign-in.'));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = ready;
    script.onerror = () => fail('Could not load Google sign-in.');
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Stops Google from silently re-selecting the last account after sign-out.
 * Without it the next "Continue with Google" can sign the same person straight
 * back in, mirroring what the Auth0 logout URL does for the SSO session.
 */
export function googleSignOut() {
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
}
