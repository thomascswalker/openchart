import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Octokit } from 'octokit';

const TOKEN_KEY = 'github_access_token';
const STATE_KEY = 'github_oauth_state';
const SCOPES = 'repo project read:user';

let memoryState: string | null = null;

const env = import.meta.env;

const storeState = (state: string) => {
  memoryState = state;
  if (!isTauri()) sessionStorage.setItem(STATE_KEY, state);
};

const takeState = (): string | null => {
  const state = isTauri() ? memoryState : sessionStorage.getItem(STATE_KEY);
  memoryState = null;
  sessionStorage.removeItem(STATE_KEY);
  return state;
};

export const initiateGitHubLogin = async (): Promise<void> => {
  const state = crypto.randomUUID();
  storeState(state);

  const desktop = isTauri();
  const clientId = desktop
    ? env.VITE_GITHUB_DESKTOP_CLIENT_ID
    : env.VITE_GITHUB_WEB_CLIENT_ID;
  const redirectUri = desktop
    ? `${env.VITE_TAURI_DEEP_LINK_SCHEME}://auth/callback`
    : `${window.location.origin}/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  const url = `https://github.com/login/oauth/authorize?${params}`;

  if (desktop) await openUrl(url);
  else window.location.assign(url);
};

export const handleGitHubCallback = async (
  callbackUrl: string,
): Promise<string> => {
  const params = new URL(callbackUrl).searchParams;
  const error = params.get('error_description') ?? params.get('error');
  if (error) throw new Error(error);

  const code = params.get('code');
  if (!code) throw new Error('Missing authorization code');

  const expected = takeState();
  if (!expected || params.get('state') !== expected) {
    throw new Error('OAuth state mismatch');
  }

  const res = await fetch(env.VITE_AUTH_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, platform: isTauri() ? 'desktop' : 'web' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? 'Token exchange failed',
    );
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
};

export const getAccessToken = (): string | null =>
  localStorage.getItem(TOKEN_KEY);

export const logout = () => localStorage.removeItem(TOKEN_KEY);

export const getAuthenticatedOctokit = (): Octokit => {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with GitHub');
  return new Octokit({ auth: token });
};
