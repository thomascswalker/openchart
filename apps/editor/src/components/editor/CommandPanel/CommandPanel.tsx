import { useCommandPanel } from "./useCommandPanel";
import { Box, Tabs } from "../../shared";
import styles from "./CommandPanel.module.css";

const CommandPanel = () => {
  const { options, children } = useCommandPanel();
  return (
    <Box
      className={styles.commandPanel}
      padding={0}
      maxWidth="100%"
      minWidth={0}
    >
      <Tabs
        alignment="left"
        flat
        collapsible
        options={options}
        width="100%"
        flex={1}
        minWidth={0}
        minHeight={0}
        maxWidth="100%"
      >
        {children}
      </Tabs>
    </Box>
  );
};

export { CommandPanel };
