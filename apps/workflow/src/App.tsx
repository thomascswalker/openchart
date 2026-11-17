import { useEffect } from 'react';

import { Box } from '@openchart/core';
import '@openchart/core/styles.css';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';

import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import { handleGitHubCallback } from './services/githubAuth';
import { GithubContext, GithubService } from './services/githubService';
import './styles.css';

const githubService = new GithubService();

const handleDeepLinks = (urls: string[]) => {
  for (const url of urls) {
    if (!url.includes('auth/callback')) continue;
    handleGitHubCallback(url)
      .then(() => window.location.reload())
      .catch((e) => console.error('GitHub sign-in failed', e));
  }
};

const App = () => {
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    getCurrent()
      .then((urls) => urls && handleDeepLinks(urls))
      .catch(console.error);
    onOpenUrl(handleDeepLinks)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(console.error);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const isCallback = window.location.pathname === '/auth/callback';

  return (
    <Box width="100vw" height="100vh">
      <GithubContext.Provider value={githubService}>
        {isCallback ? <AuthCallback /> : <Home />}
      </GithubContext.Provider>
    </Box>
  );
};

export default App;
