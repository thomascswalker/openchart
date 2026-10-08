import { Runtime } from "./Runtime";
import { Shell } from "./Shell";
import { ErrorBoundary } from "./ErrorBoundary";

const Editor = () => {
  return (
    <ErrorBoundary>
      <Runtime>
        <Shell />
      </Runtime>
    </ErrorBoundary>
  );
};

export default Editor;
