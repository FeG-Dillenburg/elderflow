import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api/domain";
import { installation } from "./installation";

let app: { unmount(): void } | undefined;
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("slow backend startup", () => {
  it("initializes normally when the installation response takes more than two seconds", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState(null, "", "/");
    vi.spyOn(api, "installation")
      .mockImplementationOnce(({ signal } = {}) => new Promise((resolve, reject) => {
        const response = setTimeout(() => resolve({ setupRequired: true, defaultLanguage: "en" }), 2500);
        signal?.addEventListener("abort", () => {
          clearTimeout(response);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }))
      .mockResolvedValue({ setupRequired: true, defaultLanguage: "en" });
    vi.spyOn(api, "me").mockRejectedValue(new Error("Not signed in"));
    app = (await import("./main")).app;
    await flushPromises();
    expect(installation.ready).toBe(true);
    expect(document.querySelector(".startup-screen")).toBeNull();
  }, 10000);
});
