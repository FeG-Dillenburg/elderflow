import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/domain";
import { getSessionToken, setSessionToken } from "./auth/session";
import { installation } from "./installation";

let app: { unmount(): void } | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("application startup", () => {
  it("keeps the index URL and saved session while the backend is unavailable instead of entering setup", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, "", "/");
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    setSessionToken("existing-session");
    vi.spyOn(api, "installation").mockRejectedValue(new Error("Backend not yet listening"));
    vi.spyOn(api, "me").mockRejectedValue(new Error("Backend not yet listening"));
    app = (await import("./main")).app;
    expect(document.querySelector('[role="status"]')?.textContent).toContain("ElderFlow is starting");
    expect(document.body.textContent).not.toContain("System setup");
    expect(window.location.pathname).toBe("/");
    expect(getSessionToken()).toBe("existing-session");
    expect(installation.ready).toBe(false);
  });
});
