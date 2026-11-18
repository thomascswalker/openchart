import React from 'react';

class GithubService {
  constructor() {
    // Initialize any necessary properties here
  }
}

const GithubContext = React.createContext<GithubService | null>(null);
const useGithubService = () => {
  const context = React.useContext(GithubContext);
  if (!context) {
    throw new Error('useGithubService must be used within a GithubProvider');
  }
  return context;
};

export { GithubService, GithubContext, useGithubService };
