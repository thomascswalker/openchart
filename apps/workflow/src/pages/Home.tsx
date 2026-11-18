import { Box, Button, FilesIcon } from '@openchart/core';
import { useState } from 'react';

import Projects from '../components/projects/Projects';
import {
  getAccessToken,
  getGitHubUsername,
  initiateGitHubLogin,
  logout,
} from '../services/github/auth';

const Home = () => {
  const [signedIn, setSignedIn] = useState(() => Boolean(getAccessToken()));
  const [username, setUsername] = useState(() => getGitHubUsername());

  const handleLogout = () => {
    logout();
    setSignedIn(false);
    setUsername(null);
  };

  return (
    <Box flexDirection="column" gap={16} padding={24} width="100%">
      <Box gap={12}>
        <Button
          className="primary-button"
          type="button"
          icon={<FilesIcon size={16} />}
        >
          Open repository
        </Button>
        <Button className="secondary-button" flat type="button">
          View docs
        </Button>
        {signedIn ? (
          <>
            <span>Welcome {username ?? 'GitHub user'}</span>
            <Button
              className="secondary-button"
              flat
              type="button"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </>
        ) : (
          <Button
            className="secondary-button"
            flat
            type="button"
            onClick={() =>
              void initiateGitHubLogin().catch((error: unknown) =>
                console.error('GitHub sign-in failed', error),
              )
            }
          >
            Sign in with GitHub
          </Button>
        )}
      </Box>
      {signedIn && <Projects />}
    </Box>
  );
};

export default Home;
