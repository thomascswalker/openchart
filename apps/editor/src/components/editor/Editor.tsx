import { InputProvider } from "../../input/InputProvider";
import { Runtime } from "./Runtime";
import { Shell } from "./Shell";
import { ErrorBoundary } from "../shared/ErrorBoundary/ErrorBoundary";

const Editor = () => {
  return (
    <ErrorBoundary>
      <InputProvider>
        <Runtime>
          <Shell />
        </Runtime>
      </InputProvider>
    </ErrorBoundary>
  );
};

export default Editor;
