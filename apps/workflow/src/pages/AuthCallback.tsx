import { useEffect, useRef, useState } from 'react';

import { handleGitHubCallback } from '../services/githubAuth';

const AuthCallback = () => {
  const [error, setError] = useState<string | null>(null);
  const callback = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    callback.current ??= handleGitHubCallback(window.location.href);
    callback.current
      .then(() => {
        if (!cancelled) window.location.replace('/');
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p>GitHub sign-in failed: {error}</p>
        <a href="/">Back to app</a>
      </div>
    );
  }
  return <div style={{ padding: 24 }}>Signing in to GitHub…</div>;
};

export default AuthCallback;
