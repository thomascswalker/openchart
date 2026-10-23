import "./App.css";
import Editor from "./components/editor/Editor";
import Platform, { PlatformProvider } from "./platform";

function App() {
  return (
    <section>
      <PlatformProvider value={Platform}>
        <Editor />
      </PlatformProvider>
    </section>
  );
}

export default App;
