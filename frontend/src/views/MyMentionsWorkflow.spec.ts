import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sodium from "libsodium-wrappers-sumo";
import { auth } from "../auth/auth";
import type { AuthUser } from "../api/domain";
import { protectedText } from "../e2ee/protected-text";
import { scalarSession } from "../e2ee/scalar-session";
import { base64UrlToBytes } from "../e2ee/protocol";
import { currentMentions, resolveMentionWithComment, setMentionState, type CurrentMention } from "../mentions/current";
import MyMentionsView from "./MyMentionsView.vue";

vi.mock("../mentions/current", () => ({
  currentMentions: vi.fn(), resolveMentionWithComment: vi.fn(), setMentionState: vi.fn(),
}));
const row: CurrentMention = {
  id: crypto.randomUUID(), topicId: crypto.randomUUID(), meetingId: crypto.randomUUID(),
  appearanceId: crypto.randomUUID(), done: false, date: "2026-10-12",
  topicName: "Private Topic", meetingTitle: "Private Meeting", context: "Private assignment",
};
let wrapper: VueWrapper;
const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  Dialog: { props: ["visible"], template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>' },
  RichTextEditor: {
    props: ["modelValue", "readonly"], emits: ["update:modelValue"],
    template: '<textarea :value="modelValue" :readonly="readonly" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
};
beforeEach(async () => {
  vi.resetAllMocks();
  await sodium.ready;
  const signing = sodium.crypto_sign_keypair();
  scalarSession.unlock({ organizationId: crypto.randomUUID(), ockId: crypto.randomUUID(), clientEpochId: crypto.randomUUID(),
    noncePrefix: new Uint8Array(16).fill(2), contentKey: new Uint8Array(32).fill(3), signingPrivateKey: signing.privateKey });
  auth.state.user = { id: crypto.randomUUID(), permissions: { topics: "manage" } } as AuthUser;
  protectedText.state.status = "unlocked";
  vi.mocked(currentMentions).mockResolvedValue([{ ...row }]);
});
afterEach(() => {
  wrapper?.unmount();
  scalarSession.lock();
  protectedText.state.status = "locked";
  auth.state.user = null;
});
async function openDialog() {
  wrapper = mount(MyMentionsView, { global: { stubs } });
  await flushPromises();
  await wrapper.get('button[aria-label="Done and comment"]').trigger("click");
}
function save() {
  return wrapper.findAll("button").find((button) => button.text() === "Save")!;
}
it("opens without changing state, rejects formatting-only drafts, and cancels without posting", async () => {
  await openDialog();
  expect(wrapper.get('[role="dialog"]').text()).toContain(row.topicName);
  await wrapper.get("textarea").setValue("<p><strong> &nbsp; </strong><br></p>");
  expect(save().attributes("disabled")).toBeDefined();
  await wrapper.findAll("button").find((button) => button.text() === "Cancel")!.trigger("click");
  expect(resolveMentionWithComment).not.toHaveBeenCalled();
  expect(setMentionState).not.toHaveBeenCalled();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
});
it("encrypts the ordinary Update, retains a lost-response draft, and retries the identical operation", async () => {
  vi.mocked(resolveMentionWithComment).mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({ id: row.id, done: true });
  await openDialog();
  await wrapper.get("textarea").setValue("<p>Private resolution</p>");
  await save().trigger("click");
  await vi.waitFor(() => expect(resolveMentionWithComment).toHaveBeenCalledOnce());
  await flushPromises();
  expect(wrapper.get("textarea").element.value).toBe("<p>Private resolution</p>");
  const payload = vi.mocked(resolveMentionWithComment).mock.calls[0][1];
  expect(JSON.stringify(payload)).not.toContain("Private resolution");
  expect(await scalarSession.decrypt({ aggregateType: 257, recordId: payload.id, fieldId: 1 }, base64UrlToBytes(payload.textEnvelope)))
    .toBe("<p>Private resolution</p>");
  await save().trigger("click");
  await flushPromises();
  expect(vi.mocked(resolveMentionWithComment).mock.calls[1][1]).toEqual(payload);
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.find('button[aria-label="Reopen"]').exists()).toBe(true);
  expect(setMentionState).not.toHaveBeenCalled();
});
it("prevents duplicate row submissions and ignores a late mutation response after locking", async () => {
  let complete!: (value: { id: string; done: boolean }) => void;
  vi.mocked(setMentionState).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  wrapper = mount(MyMentionsView, { global: { stubs } });
  await flushPromises();
  const action = wrapper.get('button[aria-label="Mark as done"]');
  await action.trigger("click");
  await action.trigger("click");
  expect(setMentionState).toHaveBeenCalledOnce();
  protectedText.state.status = "locked";
  complete({ id: row.id, done: true });
  await flushPromises();
  expect(wrapper.text()).not.toContain("Private");
  expect(wrapper.find('button[aria-label="Reopen"]').exists()).toBe(false);
});
it("clears the draft and ignores stale loads on identity change", async () => {
  await openDialog();
  await wrapper.get("textarea").setValue("Confidential draft");
  let complete!: (value: CurrentMention[]) => void;
  vi.mocked(currentMentions).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  auth.state.user = { ...auth.state.user!, id: crypto.randomUUID() };
  await flushPromises();
  expect(wrapper.find("textarea").exists()).toBe(false);
  expect(wrapper.text()).not.toContain("Private");
  protectedText.state.status = "locked";
  complete([{ ...row }]);
  await flushPromises();
  expect(wrapper.text()).not.toContain("Private");
});
it("refreshes a stale mention after a conflict and does not move it on failure", async () => {
  vi.mocked(setMentionState).mockRejectedValueOnce({ code: "MENTION_STALE" });
  wrapper = mount(MyMentionsView, { global: { stubs } });
  await flushPromises();
  vi.mocked(currentMentions).mockResolvedValueOnce([]);
  await wrapper.get('button[aria-label="Mark as done"]').trigger("click");
  await flushPromises();
  expect(wrapper.text()).toContain("A later Meeting replaced this mention");
  expect(wrapper.text()).not.toContain("Private");
});
it("explains missing comment permission while allowing personal completion", async () => {
  auth.state.user!.permissions.topics = "view";
  wrapper = mount(MyMentionsView, { global: { stubs } });
  await flushPromises();
  expect(wrapper.get('button[aria-label="Done and comment"]').attributes("disabled")).toBeDefined();
  expect(wrapper.get('button[aria-label="Mark as done"]').attributes("disabled")).toBeUndefined();
  expect(wrapper.find('[aria-label="You do not have permission to post updates to this Topic."]').exists()).toBe(true);
});
it.each(["AUTH_FORBIDDEN", "E2EE_CLIENT_EPOCH_INVALID"])("clears all confidential content immediately after %s", async (code) => {
  vi.mocked(resolveMentionWithComment).mockRejectedValueOnce({ code });
  await openDialog();
  await wrapper.get("textarea").setValue("Private resolution");
  await save().trigger("click");
  await vi.waitFor(() => expect(resolveMentionWithComment).toHaveBeenCalledOnce());
  await flushPromises();
  expect(wrapper.text()).not.toContain("Private");
  expect(wrapper.find("textarea").exists()).toBe(false);
  expect(protectedText.state.status).toBe("locked");
});
it("focuses the destination action while the outgoing row is still transitioning", async () => {
  vi.mocked(setMentionState).mockResolvedValueOnce({ id: row.id, done: true });
  wrapper = mount(MyMentionsView, { attachTo: document.body, global: { stubs: { ...stubs, 'transition-group': false } } });
  await flushPromises();
  await wrapper.get('button[aria-label="Mark as done"]').trigger("click");
  await flushPromises();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Reopen");
});
