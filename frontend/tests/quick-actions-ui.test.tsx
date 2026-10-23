import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import { playerLibrary } from "../src/services/playerLibrary";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));
beforeEach(() => {
  window.localStorage.clear(); window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo#player");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps the current game visible after a preference changes its recommendation eligibility", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "Ready or Not", level: 2 });
  const dislike = screen.getByRole("button", { name: "Not for me", exact: true });
  await waitFor(() => expect(dislike.hasAttribute("disabled")).toBe(false));
  fireEvent.click(dislike);
  await screen.findByText("Preference saved");
  expect(dislike.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "Ready or Not", level: 2 })).toBeTruthy();
  fireEvent.click(dislike);
  await waitFor(() => expect(dislike.getAttribute("aria-pressed")).toBe("false"));
  expect((await playerLibrary.getRecords("demo-user"))[0].affinity).toBe("neutral");
});

it("blocks duplicate taps and only reports confirmed writes; a failure can be reloaded", async () => {
  render(<App />);
  const like = await screen.findByRole("button", { name: "Like", exact: true });
  await waitFor(() => expect(like.hasAttribute("disabled")).toBe(false));
  let reject!: (reason: Error) => void;
  const write = vi.spyOn(playerLibrary, "updateRecord").mockImplementationOnce(() => new Promise((_resolve, decline) => { reject = decline; }));
  fireEvent.click(like); fireEvent.click(like);
  expect(write).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Saving preference…")).toBeTruthy();
  expect(like.getAttribute("aria-pressed")).toBe("false");
  reject(new Error("Lost response"));
  await screen.findByText(/Your changes could not be confirmed/);
  expect(screen.queryByText("Preference saved")).toBeNull();
  expect(like.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Like", exact: true }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Like", exact: true }));
  await screen.findByText("Preference saved");
  expect(screen.getByRole("button", { name: "Like", exact: true }).getAttribute("aria-pressed")).toBe("true");
});
