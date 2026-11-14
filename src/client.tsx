import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

const application = <StrictMode><StartClient /></StrictMode>;

startTransition(() => {
  if (window.location.protocol === "app:" && window.kernel) {
    // The packaged shell has no live SSR server. Start its local-first UI as a
    // fresh client tree instead of reconciling build-time HTML with desktop state.
    createRoot(document).render(application);
  } else {
    hydrateRoot(document, application);
  }
});
