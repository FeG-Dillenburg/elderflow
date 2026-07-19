import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import NewMembershipTopicAgenda from "./NewMembershipTopicAgenda.vue";
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
  it("emits the complete typed form patch and defaults the signal to new", async () => {
    const wrapper = mount(NewMembershipTopicFormFields, {
      shallow: true,
      props: { modelValue: { type: "new_membership", description: null } as any },
    });

    expect(wrapper.emitted("change")?.[0]).toEqual([
      { membershipStatusSignal: "new" },
    ]);
  });

  it.each([
    ["new", "New"],
    ["in_progress", "In progress"],
    ["nearly_finished", "Nearly finished"],
    ["attention", "Attention"],
    ["paused", "Paused"],
  ])("renders %s with localized non-color meaning", (signal, label) => {
    const wrapper = mount(NewMembershipTopicList, {
      props: { topic: topic(signal) as any },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain(label);
    expect(wrapper.html()).toContain(`data-signal=\"${signal}\"`);
    expect(wrapper.text()).toContain("Membership class booked");
  });

  it("shows Done only at nearly finished and omits TOP numbering", () => {
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
      global: { stubs: { Button: { props: ["label"], template: "<button>{{ label }}</button>" } } },
    });
    const ready = mount(NewMembershipTopicAgenda, {
      shallow: true,
      props: { ...base, item: { topic: topic("nearly_finished") } as any },
      global: { stubs: { Button: { props: ["label"], template: "<button>{{ label }}</button>" } } },
    });

    expect(early.text()).not.toContain("Mark done");
    expect(ready.text()).toContain("Mark done");
    expect(ready.text()).not.toContain("TOP");
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
    expect(wrapper.text()).toContain("Paused");
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
    expect(wrapper.text()).toContain("Attention");
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
