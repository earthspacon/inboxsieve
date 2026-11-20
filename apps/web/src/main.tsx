import "./index.css";

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { App } from "./app/App";
import { appStarted } from "./session/model";

const root = document.getElementById("root");

appStarted();

// Public pages ship prerendered HTML (scripts/prerender.ts); hydrate only when it belongs to this URL.
if (root?.dataset.prerendered === window.location.pathname) {
  hydrateRoot(
    root,
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
