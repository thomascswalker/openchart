import { Box, Button, FilesIcon, H1, Text } from '@openchart/core';

const Home = () => {
  return (
    <Box flexDirection="column" gap={16} padding={24}>
      <Text>OpenChart</Text>
      <H1>Workflow Desktop</H1>
      <Text>
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
  );
};

export default Home;
