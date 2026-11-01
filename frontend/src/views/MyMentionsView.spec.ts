import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { protectedText } from "../e2ee/protected-text";
import MyMentionsView from "./MyMentionsView.vue";

afterEach(() => vi.restoreAllMocks());
it("offers unlock without loading or exposing plaintext while locked", async () => {
  protectedText.state.status = "locked";
  const fetch = vi.spyOn(globalThis, "fetch");
  const wrapper = mount(MyMentionsView);
  await flushPromises();
  expect(wrapper.text()).toContain("Unlock Protected text");
  expect(wrapper.find("table").exists()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  wrapper.unmount();
});

it("decrypts current assignments and removes all plaintext immediately when locked", async () => {
  const { default: sodium } = await import("libsodium-wrappers-sumo");
  const { scalarSession } = await import("../e2ee/scalar-session");
  const { bytesToBase64Url } = await import("../e2ee/protocol");
  await sodium.ready;
  const signing = sodium.crypto_sign_keypair();
  const id = crypto.randomUUID();
  const topicId = crypto.randomUUID();
  const meetingId = crypto.randomUUID();
  const appearanceId = crypto.randomUUID();
  scalarSession.unlock({ organizationId: crypto.randomUUID(), ockId: crypto.randomUUID(), clientEpochId: crypto.randomUUID(),
    noncePrefix: new Uint8Array(16).fill(2), contentKey: new Uint8Array(32).fill(3), signingPrivateKey: signing.privateKey });
  const contextEnvelope = bytesToBase64Url(await scalarSession.encrypt({ aggregateType: 260, recordId: id, fieldId: 1 }, JSON.stringify({ meetingId, appearanceId, context: "Private assignment sentence." })));
  const topicNameEnvelope = bytesToBase64Url(await scalarSession.encrypt({ aggregateType: 256, recordId: topicId, fieldId: 1 }, "Private Topic"));
  const meetingTitleEnvelope = bytesToBase64Url(await scalarSession.encrypt({ aggregateType: 259, recordId: meetingId, fieldId: 1 }, "Private Meeting"));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ id, topicId, meetingId, appearanceId, date: "2026-10-12", contextEnvelope, topicNameEnvelope, meetingTitleEnvelope }]), { headers: { "Content-Type": "application/json" } }));
  protectedText.state.status = "unlocked";
  const wrapper = mount(MyMentionsView, { global: { stubs: { RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' } } } });
  await vi.waitFor(() => expect(wrapper.text()).toContain("Private assignment sentence."));
  expect(wrapper.find(`a[href="/topics/${topicId}"]`).text()).toBe("Private Topic");
  expect(wrapper.find(`a[href="/meetings/${meetingId}"]`).text()).toContain("Private Meeting");
  const done = wrapper.find('button[aria-label="Mark as done"]');
  expect(done.exists()).toBe(true);
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id, done: true })));
  await done.trigger("click");
  await flushPromises();
  expect(wrapper.find('button[aria-label="Reopen"]').exists()).toBe(true);
  expect(wrapper.find('button[aria-label="Mark as done"]').exists()).toBe(false);
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id, done: false })));
  await wrapper.find('button[aria-label="Reopen"]').trigger("click");
  await flushPromises();
  expect(wrapper.find('button[aria-label="Mark as done"]').exists()).toBe(true);
  protectedText.state.status = "locked";
  scalarSession.lock();
  await flushPromises();
  expect(wrapper.text()).not.toContain("Private");
  expect(wrapper.find("table").exists()).toBe(false);
  wrapper.unmount();
});
