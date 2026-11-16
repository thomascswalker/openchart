import { Box, Button, FilesIcon, Text } from '@openchart/core';
import '@openchart/core/styles.css';

import './styles.css';

const App = () => {
  return (
    <main className="workflow-desktop-app">
      <Box
        className="workflow-desktop-shell"
        flexDirection="column"
        gap={16}
        padding={24}
      >
        <Text className="eyebrow">OpenChart</Text>
        <Text className="title" role="heading">
          Workflow Desktop
        </Text>
        <Text className="subtitle">
          This foundation app is intentionally minimal. Repository and MIDI
          workflows are deferred to a future milestone.
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
