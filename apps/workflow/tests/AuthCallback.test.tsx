import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';

import { expect, it, vi } from 'vitest';

import AuthCallback from '../src/pages/AuthCallback';
import { handleGitHubCallback } from '../src/services/github/auth';

vi.mock('../src/services/github/auth', () => ({
  handleGitHubCallback: vi.fn(),
}));

it('processes the callback once and displays errors in Strict Mode', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(handleGitHubCallback).mockRejectedValue(
    new Error('Token exchange failed'),
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <StrictMode>
          <AuthCallback />
        </StrictMode>,
      );
    });

    expect(handleGitHubCallback).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      'GitHub sign-in failed: Token exchange failed',
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
