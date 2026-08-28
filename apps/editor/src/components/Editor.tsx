import { EditorProvider } from "./Context";
import { Workspace } from "./Workspace";
import { Toolbar } from "./Toolbar";

import "./styles.css";

const Editor = () => {
  return (
    <EditorProvider>
      <div className="midi-editor">
        <Toolbar />
        <Workspace />
      </div>
    </EditorProvider>
  );
};

export default Editor;
