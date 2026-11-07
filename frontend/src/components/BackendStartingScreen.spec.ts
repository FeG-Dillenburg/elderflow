import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import { setLanguage } from "../i18n";
import BackendStartingScreen from "./BackendStartingScreen.vue";

enableAutoUnmount(afterEach);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("backend startup screen", () => {
  it("waits two seconds between checks and signals one full restart when the backend recovers", async () => {
    const installation = vi.spyOn(api, "installation")
      .mockRejectedValueOnce(new Error("Backend starting"))
      .mockResolvedValue({ setupRequired: false, defaultLanguage: "en" });
    const wrapper = mount(BackendStartingScreen);
    expect(wrapper.get('[role="status"]').text()).toContain("ElderFlow is starting");
    expect(wrapper.get("img").attributes("src")).toBe("/elderflow-wordmark-color.png");
    await vi.advanceTimersByTimeAsync(1999);
    expect(installation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(installation).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("ready")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(wrapper.emitted("ready")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(installation).toHaveBeenCalledTimes(2);
  });
  it("times out an unresponsive check and retries on the next two-second tick", async () => {
    let requestSignal: AbortSignal | undefined;
    const installation = vi.spyOn(api, "installation")
      .mockImplementationOnce(({ signal } = {}) => new Promise((_resolve, reject) => {
        requestSignal = signal;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }))
      .mockResolvedValue({ setupRequired: true, defaultLanguage: null });
    const wrapper = mount(BackendStartingScreen);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(1799);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(installation).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("ready")).toHaveLength(1);
  });

  it("aborts pending work on disposal and ignores late success", async () => {
    let resolve!: (value: { setupRequired: boolean; defaultLanguage: null }) => void;
    let signal: AbortSignal | undefined;
    const installation = vi.spyOn(api, "installation").mockImplementation((options) => {
      signal = options?.signal;
      return new Promise((done) => { resolve = done; });
    });
    const wrapper = mount(BackendStartingScreen);
    await vi.advanceTimersByTimeAsync(2000);
    wrapper.unmount();
    expect(signal?.aborted).toBe(true);
    resolve({ setupRequired: false, defaultLanguage: null });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(6000);
    expect(wrapper.emitted("ready")).toBeUndefined();
    expect(installation).toHaveBeenCalledTimes(1);
  });

  it("shows localized startup copy", () => {
    setLanguage("de");
    const wrapper = mount(BackendStartingScreen);
    expect(wrapper.get('[role="status"]').text()).toContain("ElderFlow startet");
  });

});
