import CommandPanel from "../CommandPanel";
import { Viewport } from "../Viewport";
import Splitter from "../../shared/Splitter";
import styles from "./Workspace.module.css";

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
