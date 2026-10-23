import "./App.css";
import { Runtime, Shell } from "./components/editor";
import { ErrorBoundary } from "./components/shared";
import { InputProvider } from "./input/InputProvider";
import Platform, { PlatformProvider } from "./platform";

function App() {
  return (
    <section>
      <PlatformProvider value={Platform}>
        <ErrorBoundary>
          <InputProvider>
            <Runtime>
              <Shell />
            </Runtime>
          </InputProvider>
        </ErrorBoundary>
      </PlatformProvider>
    </section>
  );
}

export default App;
