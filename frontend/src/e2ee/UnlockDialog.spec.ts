import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth/auth";
import { installation } from "../installation";
import router from "../router";
import UnlockDialog from "./UnlockDialog.vue";
import { protectedText } from "./protected-text";

const stubs = {
  Button: {
    props: ["type", "label", "loading", "disabled", "icon"],
    emits: ["click"],
    template: `
      <button
        :type="type || 'button'"
        :disabled="disabled"
        :data-icon="icon"
        :data-loading="loading"
        @click="$emit('click')"
      >
        {{ label }}
      </button>
    `,
  },
  Dialog: {
    props: ["visible", "pt"],
    template: '<section v-if="visible" role="dialog" v-bind="pt.root"><slot /></section>',
  },
  Password: {
    name: "Password",
    props: {
      modelValue: String,
      placeholder: String,
      disabled: Boolean,
      inputId: String,
      toggleMask: Boolean,
    },
    emits: ["update:modelValue"],
    data: () => ({ revealed: false }),
    template: `
      <span>
        <input
          :id="inputId"
          :type="revealed ? 'text' : 'password'"
          :value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          @input="$emit('update:modelValue', $event.target.value)"
        />
        <button
          v-if="toggleMask"
          class="toggle-password"
          type="button"
          :disabled="disabled"
          @click="revealed = !revealed"
        >
          Toggle password visibility
        </button>
      </span>
    `,
  },
  RouterLink: {
    props: ["to"],
    template: '<a :href="to"><slot /></a>',
  },
};

describe("Protected-text unlock dialog", () => {
  afterEach(() => {
    protectedText.state.promptVisible = false;
    protectedText.state.status = "locked";
    protectedText.state.error = false;
    auth.completeInitialization(null);
    installation.setupRequired = true;
    vi.restoreAllMocks();
  });

  it("explains the private unlock step and offers the prototype actions", () => {
    protectedText.state.promptVisible = true;

    const wrapper = mount(UnlockDialog, { global: { stubs } });

    expect(wrapper.find(".pi-shield").exists()).toBe(true);
    expect(wrapper.get('[role="dialog"]').attributes()).toMatchObject({
      "aria-describedby": "protected-text-unlock-description",
      "aria-labelledby": "protected-text-unlock-title",
    });
    expect(wrapper.text()).toContain("One more private step");
    expect(wrapper.get("h2").text()).toBe("Unlock Protected text?");
    expect(wrapper.text()).toContain(
      "You are signed in. Enter the separate shared passphrase to read and edit confidential meeting text on this device.",
    );
    expect(wrapper.get("input").attributes("placeholder")).toBe(
      "Enter the passphrase",
    );
    expect(wrapper.text()).toContain("Unlock Protected text");
    expect(wrapper.text()).toContain("Continue without unlocking");
    expect(wrapper.text()).toContain("I do not know the passphrase");
    expect(wrapper.text()).toContain(
      "Unlocking decrypts Protected text only in this browser session.",
    );
  });

  it("focuses the passphrase when the automatic prompt is already open", async () => {
    protectedText.state.promptVisible = true;

    const wrapper = mount(UnlockDialog, {
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.get("input").element);
    wrapper.unmount();
  });

  it("opens the real recovery experience for an eligible Key operator", async () => {
    installation.setupRequired = false;
    auth.completeInitialization({
      id: "operator",
      email: "operator@example.com",
      firstName: "Key",
      lastName: "Operator",
      role: "admin",
      language: "en",
      permissions: {
        dashboard: "manage",
        users: "manage",
        references: "view",
        meetings: "manage",
        topics: "manage",
        tasks: "manage",
        contentSettings: "manage",
        authSettings: "hide",
      },
    });
    await router.push("/");
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, { global: { stubs } });

    const recovery = wrapper
      .findAll("button")
      .find((button) => button.text() === "I do not know the passphrase");
    expect(recovery).toBeDefined();
    await recovery!.trigger("click");
    await flushPromises();

    expect(protectedText.state.promptVisible).toBe(false);
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/key-recovery");
    });
  });

  it("clears and refocuses the passphrase after an inline unlock failure", async () => {
    vi.spyOn(protectedText, "unlock").mockImplementation(async () => {
      protectedText.state.error = true;
    });
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, {
      attachTo: document.body,
      global: { stubs },
    });
    const input = wrapper.get("input");
    await input.setValue("incorrect passphrase");

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(protectedText.unlock).toHaveBeenCalledWith("incorrect passphrase");
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "That passphrase did not unlock Protected text.",
    );
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input.element);
    wrapper.unmount();
  });

  it("keeps all unlock choices unavailable while key derivation is running", () => {
    protectedText.state.promptVisible = true;
    protectedText.state.status = "unlocking";
    const wrapper = mount(UnlockDialog, { global: { stubs } });

    expect(wrapper.get("input").attributes("disabled")).toBeDefined();
    expect(wrapper.findComponent({ name: "Password" }).props("toggleMask"))
      .toBe(true);
    expect(wrapper.get(".unlock-submit").attributes("data-loading")).toBe(
      "true",
    );
    expect(
      wrapper
        .findAll("button")
        .every((button) => button.attributes("disabled") !== undefined),
    ).toBe(true);
  });

  it("continues with Protected text locked when the quiet action is chosen", async () => {
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, { global: { stubs } });

    await wrapper.get(".continue-button").trigger("click");

    expect(protectedText.state.promptVisible).toBe(false);
    expect(protectedText.state.status).toBe("locked");
  });

  it("closes after a successful keyboard submission", async () => {
    vi.spyOn(protectedText, "unlock").mockImplementation(async () => {
      protectedText.state.status = "unlocked";
      protectedText.state.promptVisible = false;
    });
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, { global: { stubs } });
    await wrapper.get("input").setValue("correct passphrase");

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(protectedText.unlock).toHaveBeenCalledWith("correct passphrase");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(protectedText.state.status).toBe("unlocked");
  });

  it("opens and focuses again after continuing without unlocking", async () => {
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, {
      attachTo: document.body,
      global: { stubs },
    });
    await wrapper.get(".continue-button").trigger("click");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    protectedText.state.promptVisible = true;
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get("input").element);
    wrapper.unmount();
  });

  it("reveals and hides the passphrase with the visibility control", async () => {
    protectedText.state.promptVisible = true;
    const wrapper = mount(UnlockDialog, { global: { stubs } });
    const input = wrapper.get("input");

    expect(input.attributes("type")).toBe("password");
    await wrapper.get(".toggle-password").trigger("click");
    expect(input.attributes("type")).toBe("text");
    await wrapper.get(".toggle-password").trigger("click");
    expect(input.attributes("type")).toBe("password");
  });
});
