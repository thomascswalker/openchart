import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import "./index.css";
import App from "./App.tsx";
import { bootstrapEditorServices } from "./bootstrap";

bootstrapEditorServices();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
