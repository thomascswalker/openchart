import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import "./index.css";
import App from "./App.tsx";
import { bootstrap } from "./bootstrap";

bootstrap();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
