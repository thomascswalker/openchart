import { Box, Button, FilesIcon, Text } from '@openchart/core';
import '@openchart/core/styles.css';

import './styles.css';

const App = () => {
  return (
    <main className="git-desktop-app">
      <Box
        className="git-desktop-shell"
        flexDirection="column"
        gap={16}
        padding={24}
      >
        <Text className="eyebrow">OpenChart</Text>
        <Text
          className="title"
          role="heading"
          style={{ fontSize: 32, fontWeight: 600 }}
        >
          Git Desktop
        </Text>
        <Text className="subtitle">
          This foundation app is intentionally minimal. Repository workflows,
          MIDI editing, and Git automation are deferred to a future milestone.
        </Text>
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
        </Box>
      </Box>
    </main>
  );
};

export default App;
