import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import NewMembershipTopicAgenda from "./NewMembershipTopicAgenda.vue";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import NewMembershipTopicDetail from "./NewMembershipTopicDetail.vue";
import NewMembershipTopicFormFields from "./NewMembershipTopicFormFields.vue";
import NewMembershipTopicList from "./NewMembershipTopicList.vue";

const topic = (signal = "in_progress") => ({
  id: "topic",
  type: "new_membership",
  name: "Alex and Sam",
  description: "Optional background",
  responsibleUser: { firstName: "Ada", lastName: "Lovelace" },
  membershipProcessStatus: "Membership class booked",
  membershipStatusSignal: signal,
  godparents: "Taylor and Robin",
});

describe("New membership Topic renderers", () => {
  it("initializes new Topic status text and color together", async () => {
    const wrapper = mount(NewMembershipTopicFormFields, {
      shallow: true,
      props: {
        modelValue: { type: "new_membership", description: null } as any,
        initializeDefaults: true,
      },
    });

    expect(wrapper.emitted("change")?.[0]).toEqual([
      {
        membershipProcessStatus: "New",
        membershipStatusSignal: "new",
      },
    ]);
  });

  it("places the creation-only Default section beside Godparent(s)", () => {
    const wrapper = mount(NewMembershipTopicFormFields, {
      shallow: true,
      props: {
        modelValue: {
          type: "new_membership",
          membershipProcessStatus: "New",
          membershipStatusSignal: "new",
          description: null,
        } as any,
      },
      slots: {
        default: "<label><span>Default section</span><select /></label>",
      },
    });

    expect(wrapper.findAll("label > span").map((label) => label.text())).toEqual([
      "Status text",
      "Status color",
      "Godparent(s)",
      "Default section",
      "Description (optional)",
    ]);
  });

  it.each([
    ["new", "New", "pi-star-fill", "rgb(199, 70, 70)", "rgb(255, 255, 255)"],
    ["in_progress", "In progress", "pi-cog", "rgb(72, 120, 193)", "rgb(255, 255, 255)"],
    ["nearly_finished", "Nearly finished", "pi-check", "rgb(59, 149, 98)", "rgb(255, 255, 255)"],
    ["attention", "Attention", "pi-exclamation-triangle", "rgb(242, 201, 76)", "rgb(47, 43, 31)"],
    ["paused", "Paused", "pi-pause", "rgb(217, 121, 49)", "rgb(255, 255, 255)"],
  ])("renders %s as one icon and status-text pill", (signal, label, icon, background, color) => {
    const wrapper = mount(NewMembershipTopicList, {
      attachTo: document.body,
      props: { topic: topic(signal) as any },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    const pill = wrapper.find(".membership-signal");
    expect(pill.attributes("data-signal")).toBe(signal);
    expect(pill.attributes("aria-label")).toContain(label);
    expect(pill.find(".p-tag-icon").classes()).toContain(icon);
    expect(getComputedStyle(pill.element).backgroundColor).toBe(background);
    expect(getComputedStyle(pill.element).color).toBe(color);
    expect(wrapper.text()).toContain("Membership class booked");
    expect(wrapper.text()).not.toContain(label);
    wrapper.unmount();
  });

  it("shows a toggle at nearly finished, reflects completion, and omits TOP numbering", async () => {
    const base = {
      canEdit: true,
      users: [],
      saveField: vi.fn(),
      saveNote: vi.fn(),
      markDone: vi.fn(),
    };
    const early = mount(NewMembershipTopicAgenda, {
      shallow: true,
      props: { ...base, item: { topic: topic("in_progress") } as any },
    });
    const ready = mount(NewMembershipTopicAgenda, {
      shallow: true,
      props: { ...base, item: { topic: topic("nearly_finished") } as any },
    });

    expect(early.findComponent({ name: "TopicDoneButton" }).exists()).toBe(false);
    expect(ready.findComponent({ name: "TopicDoneButton" }).props("done")).toBe(false);
    expect(ready.text()).not.toContain("TOP");

    await ready.setProps({
      item: {
        topic: {
          ...topic("nearly_finished"),
          status: "done",
        },
      } as any,
    });

    expect(ready.findComponent({ name: "TopicDoneButton" }).props("done")).toBe(true);
  });

  it("renders completed values from snapshots instead of later live state", () => {
    const wrapper = mount(NewMembershipTopicAgenda, {
      props: {
        item: {
          topic: topic("attention"),
          topicNameSnapshot: "Recorded name",
          responsibleUserDisplayNameSnapshot: "Recorded owner",
          membershipProcessStatusSnapshot: "Recorded process",
          membershipStatusSignalSnapshot: "paused",
          godparentsSnapshot: "Recorded godparents",
          agendaNote: "Recorded note",
        } as any,
        canEdit: false,
        completed: true,
        users: [],
        saveField: vi.fn(),
        saveNote: vi.fn(),
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain("Recorded name");
    expect(wrapper.text()).toContain("Recorded owner");
    expect(wrapper.text()).toContain("Recorded process");
    expect(wrapper.find(".signal-icon").attributes("aria-label")).toContain("Paused");
    expect(wrapper.text()).toContain("Recorded godparents");
    expect(wrapper.text()).not.toContain("Membership class booked");
  });

  it("renders live values read-only for a viewer of an active Meeting", () => {
    const wrapper = mount(NewMembershipTopicAgenda, {
      props: {
        item: { topic: topic("attention") } as any,
        canEdit: false,
        completed: false,
        users: [],
        saveField: vi.fn(),
        saveNote: vi.fn(),
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain("Membership class booked");
    expect(wrapper.find(".signal-icon").attributes("aria-label")).toContain("Attention");
  });

  it("combines process status and the icon-only signal picker in one colored field", async () => {
    const saveField = vi.fn().mockResolvedValue(topic("attention"));
    const wrapper = mount(NewMembershipTopicAppearance, {
      shallow: true,
      props: {
        item: { topic: topic("new") } as any,
        canEdit: true,
        users: [],
        saveField,
        saveNote: vi.fn(),
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.find(".status-value").attributes("data-signal")).toBe("new");
    expect(wrapper.find(".signal-trigger i").classes()).toContain("pi-star-fill");
    expect(wrapper.findAll(".cell-label").map((label) => label.text())).toEqual([
      "Name",
      "Responsible",
      "Godparent(s)",
      "Status",
    ]);
    expect(wrapper.find(".note-field > span").text()).toBe("Note");

    await wrapper.find(".signal-trigger").trigger("click");
    const options = wrapper.findAll('[role="menuitemradio"]');

    expect(options).toHaveLength(5);
    expect(options.every((option) => option.text() === "")).toBe(true);
    expect(options.map((option) => option.find("i").classes().find((name) => name !== "pi"))).toEqual([
      "pi-star-fill",
      "pi-cog",
      "pi-check",
      "pi-exclamation-triangle",
      "pi-pause",
    ]);

    await options[3].trigger("click");

    expect(wrapper.find(".status-value").attributes("data-signal")).toBe("attention");
    expect(saveField).toHaveBeenCalledWith({ membershipStatusSignal: "attention" });
  });

  it("shows all detailed membership fields and optional description", () => {
    const wrapper = mount(NewMembershipTopicDetail, {
      props: { topic: topic() as any },
    });
    expect(wrapper.text()).toContain("Membership process status");
    expect(wrapper.text()).toContain("Taylor and Robin");
    expect(wrapper.text()).toContain("Optional background");
  });
});
