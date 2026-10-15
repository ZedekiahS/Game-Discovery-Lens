import { useSyncExternalStore } from "react";

export type WorkspaceView = "player" | "developer";
export type AppPage = WorkspaceView | "library" | "profile";

function currentPage(): AppPage | null {
  const hash = window.location.hash;
  return hash === "#player" ? "player" : hash === "#developer" ? "developer"
    : hash === "#player/library" ? "library" : hash === "#player/profile" ? "profile" : null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// Native links retain refresh, deep links and browser Back without a routing dependency.
// These public views never assign an account role or change API authorization.
export function usePage() {
  return useSyncExternalStore(subscribe, currentPage);
}
