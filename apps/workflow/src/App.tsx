import { Box } from '@openchart/core';
import '@openchart/core/styles.css';

import Home from './pages/Home';
import { GithubContext, GithubService } from './services/githubService';
import './styles.css';

const githubService = new GithubService();

const App = () => {
  return (
    <Box width="100vw" height="100vh">
      <GithubContext.Provider value={githubService}>
        <Home />
      </GithubContext.Provider>
    </Box>
  );
};

export default App;
