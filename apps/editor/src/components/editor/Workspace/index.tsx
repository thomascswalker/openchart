import { Splitter } from '../../shared';
import { CommandPanel } from '../CommandPanel';
import { Viewport } from '../Viewport';
import styles from './Workspace.module.css';

export const Workspace = () => {
  return (
    <div className={styles.workspace}>
      <Splitter>
        <CommandPanel />
        <Viewport />
      </Splitter>
    </div>
  );
};
