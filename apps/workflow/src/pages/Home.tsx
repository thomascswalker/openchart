import { Box, Button, FilesIcon } from '@openchart/core';

import Assignments from '../components/Assignments';
import { initiateGitHubLogin } from '../services/githubAuth';

const Home = () => {
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
        <Button
          className="secondary-button"
          flat
          type="button"
          onClick={() => void initiateGitHubLogin()}
        >
          Sign in with GitHub
        </Button>
      </Box>
      <Assignments />
    </Box>
  );
};

export default Home;
