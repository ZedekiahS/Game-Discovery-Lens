import { useSyncExternalStore } from "react";

export type WorkspaceView = "player" | "developer";
export type AppPage = WorkspaceView | "library" | "profile";

const navigationGuards = new Set<() => boolean>();
export function registerNavigationGuard(guard: () => boolean) {
  navigationGuards.add(guard);
  return () => { navigationGuards.delete(guard); };
}

export function confirmPageExit() {
  return [...navigationGuards].every((guard) => guard());
}

function currentPage(): AppPage | null {
  const hash = window.location.hash;
  return hash === "#player" ? "player" : hash === "#developer" ? "developer"
    : hash === "#player/library" ? "library" : hash === "#player/profile" ? "profile" : null;
}

function subscribe(onChange: () => void) {
  let acceptedHash = window.location.hash;
  function navigate() {
    if (window.location.hash === acceptedHash) return;
    if (!confirmPageExit()) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${acceptedHash}`);
      return;
    }
    acceptedHash = window.location.hash;
    onChange();
  }
  window.addEventListener("hashchange", navigate);
  window.addEventListener("popstate", navigate);
  return () => {
    window.removeEventListener("hashchange", navigate);
    window.removeEventListener("popstate", navigate);
  };
}

// Native links retain refresh, deep links and browser Back without a routing dependency.
// These public views never assign an account role or change API authorization.
export function usePage() {
  return useSyncExternalStore(subscribe, currentPage);
}
