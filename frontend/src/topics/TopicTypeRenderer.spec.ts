import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TopicTypeRenderer from "./TopicTypeRenderer.vue";
import GenericTopicFormFields from "./types/generic/GenericTopicFormFields.vue";
import GenericTopicPreparation from "./types/generic/GenericTopicPreparation.vue";
import GenericTopicAgenda from "./types/generic/GenericTopicAgenda.vue";
import PersonTopicAgenda from "./types/person/PersonTopicAgenda.vue";
import PersonTopicDetail from "./types/person/PersonTopicDetail.vue";
import PersonTopicList from "./types/person/PersonTopicList.vue";
import PersonTopicPreparation from "./types/person/PersonTopicPreparation.vue";
import TopicTypeBadge from "./components/TopicTypeBadge.vue";

describe("TopicTypeRenderer", () => {
  it.each(["form", "preparation", "agenda", "detail", "list"] as const)(
    "dispatches New membership through its dedicated %s renderer",
    (context) => {
      const topic = { id: "topic", name: "Alex", type: "new_membership" } as any;
      const contextProps = context === "form"
        ? { modelValue: { type: "new_membership", membershipStatusSignal: "new" } }
        : context === "agenda"
          ? { item: { topic }, canEdit: false, users: [], saveField: vi.fn(), saveNote: vi.fn() }
          : { topic };
      const wrapper = mount(TopicTypeRenderer, {
        shallow: true,
        props: { type: "new_membership", context },
        attrs: contextProps,
      });
      expect(wrapper.html()).toContain(
        `new-membership-topic-${context === "form" ? "form-fields" : context}-stub`,
      );
    },
  );

  it.each(["form", "preparation", "agenda", "detail", "list"] as const)(
    "dispatches Generic through the %s context",
    (context) => {
      const topic = { id: "topic", name: "Topic", type: "generic" } as any;
      const contextProps = context === "form"
        ? { modelValue: { type: "generic", description: null } }
        : context === "agenda"
          ? { item: { topic } }
          : { topic };
      const wrapper = mount(TopicTypeRenderer, {
        shallow: true,
        props: { type: "generic", context },
        attrs: contextProps,
      });
      expect(wrapper.find(`[data-v-app]`).exists()).toBe(false);
      expect(wrapper.find("message-stub").exists()).toBe(false);
      expect(wrapper.html()).toContain(`generic-topic-${context === "form" ? "form-fields" : context}-stub`);
    },
  );

  it("renders a localized visible error for an unknown discriminator", () => {
    const wrapper = mount(TopicTypeRenderer, {
      shallow: true,
      props: { type: "legacy", context: "detail" },
      global: {
        stubs: { Message: { template: "<div><slot /></div>" } },
      },
    });
    expect(wrapper.text()).toContain("Unknown Topic type");
  });

  it("emits a semantic description patch instead of persisting from the child", async () => {
    const wrapper = mount(GenericTopicFormFields, {
      shallow: true,
      props: {
        modelValue: { type: "generic", description: null } as any,
      },
    });

    await wrapper.findComponent({ name: "RichTextEditor" }).vm.$emit(
      "update:modelValue",
      "<p>Context</p>",
    );

    expect(wrapper.emitted("change")?.[0]).toEqual([
      { description: "<p>Context</p>" },
    ]);
  });

  it("preserves the one-line preparation suggestion metadata", () => {
    const wrapper = mount(GenericTopicPreparation, {
      props: {
        topic: {
          name: "Topic",
          type: "generic",
          followUpDate: "2026-07-20",
        } as any,
        showType: true,
      },
    });

    expect(wrapper.find("small").text().replace(/\s+/g, " ")).toBe(
      "Generic · 7/20/2026",
    );
  });

  it("labels a recurring preparation suggestion as Recurring", () => {
    const wrapper = mount(TopicTypeRenderer, {
      props: { type: "recurring", context: "preparation" },
      attrs: {
        topic: {
          id: "topic",
          name: "Financial report",
          type: "recurring",
        },
        showType: true,
      },
      global: {
        stubs: { RouterLink: { template: "<a><slot /></a>" } },
      },
    });

    expect(wrapper.text()).toContain("Recurring");
    expect(wrapper.text()).not.toContain("Person");
  });

  it("renders the snapshotted responsible display name for a completed appearance", () => {
    const wrapper = mount(GenericTopicAgenda, {
      props: {
        item: {
          topic: {
            name: "Recorded Topic",
            responsibleUser: { firstName: "Later", lastName: "Owner" },
          },
          responsibleUserDisplayNameSnapshot: "Recorded Owner",
        } as any,
      },
      global: {
        stubs: { RouterLink: { template: "<a><slot /></a>" } },
      },
    });

    expect(wrapper.text()).toContain("Recorded Owner");
    expect(wrapper.text()).not.toContain("Later Owner");
  });

  it.each(["form", "preparation", "agenda", "detail", "list"] as const)(
    "dispatches Person through its dedicated %s renderer",
    (context) => {
      const topic = { id: "topic", name: "Alex and Sam", type: "person" } as any;
      const contextProps = context === "form"
        ? { modelValue: { type: "person", description: null } }
        : context === "agenda"
          ? { item: { topic }, canEdit: false, saveNote: async () => ({} as any) }
          : { topic };
      const wrapper = mount(TopicTypeRenderer, {
        shallow: true,
        props: { type: "person", context },
        attrs: contextProps,
      });

      expect(wrapper.html()).toContain(`person-topic-${context === "form" ? "form-fields" : context}-stub`);
    },
  );

  it("renders a compact Person agenda without Generic-only chrome", () => {
    const wrapper = mount(PersonTopicAgenda, {
      shallow: true,
      props: {
        item: {
          id: "appearance",
          topicId: "topic",
          topic: { name: "Recorded couple", type: "person" },
          topicNameSnapshot: "Recorded couple",
          agendaNote: "Private note",
        } as any,
        canEdit: false,
        saveNote: async () => ({} as any),
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          PersonTopicNote: {
            props: ["item"],
            template: '<span><slot name="label" />{{ item.agendaNote }}</span>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Recorded couple");
    expect(wrapper.text()).toContain("Private note");
    expect(wrapper.text()).not.toContain("TOP");
    expect(wrapper.find(".updates").exists()).toBe(false);
    expect(wrapper.find(".tasks").exists()).toBe(false);
  });

  it("places the Person name inside the preparation note when an appearance exists", () => {
    const wrapper = mount(PersonTopicPreparation, {
      shallow: true,
      props: {
        topic: { id: "topic", name: "Alex", type: "person" } as any,
        item: { id: "appearance", topicId: "topic", agendaNote: "Context" } as any,
        saveNote: async () => ({} as any),
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          PersonTopicNote: {
            template: '<span class="note"><slot name="label" /></span>',
          },
        },
      },
    });

    expect(wrapper.get(".note").text()).toBe("Alex:");
    expect(wrapper.find(".person-preparation > .person-name").exists()).toBe(false);
  });

  it("keeps the Person name standalone in preparation suggestions", () => {
    const wrapper = mount(PersonTopicPreparation, {
      shallow: true,
      props: {
        topic: { id: "topic", name: "Alex", type: "person" } as any,
        showType: true,
      },
      global: {
        stubs: { RouterLink: { template: "<a><slot /></a>" } },
      },
    });

    expect(wrapper.get(".person-name").text()).toBe("Alex");
    expect(wrapper.text()).toContain("Person");
  });

  it("keeps only the relevant compact Person lifecycle action inline", async () => {
    const markDone = vi.fn();
    const wrapper = mount(PersonTopicAgenda, {
      shallow: true,
      props: {
        item: {
          id: "appearance",
          topicId: "topic",
          topic: { name: "Alex", type: "person", status: "open" },
        } as any,
        canEdit: true,
        saveNote: async () => ({} as any),
        markDone,
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          PersonTopicNote: true,
        },
      },
    });

    const button = wrapper.findComponent({ name: "TopicDoneButton" });
    expect(button.exists()).toBe(true);
    expect(button.props("done")).toBe(false);
    expect(wrapper.text()).not.toContain("Defer");
    await button.vm.$emit("toggle");
    expect(markDone).toHaveBeenCalledOnce();
  });

  it("renders the Person list without type-specific summary metadata", () => {
    const wrapper = mount(PersonTopicList, {
      props: { topic: { id: "person", name: "Alex and Sam", type: "person" } as any },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toBe("Alex and Sam");
    expect(wrapper.find("small").exists()).toBe(false);
  });

  it("renders sanitized Person description in the detail context", () => {
    const wrapper = mount(PersonTopicDetail, {
      props: {
        topic: {
          type: "person",
          description: '<img src="x" onerror="alert(1)"><p>Pastoral context</p>',
        } as any,
      },
    });

    expect(wrapper.text()).toContain("Description");
    expect(wrapper.text()).toContain("Pastoral context");
    expect(wrapper.html()).not.toContain("onerror");
  });

  it("renders the localized Person type as a badge", () => {
    const wrapper = mount(TopicTypeBadge, {
      shallow: true,
      props: { type: "person" },
    });

    expect(wrapper.get("tag-stub").attributes("value")).toBe("Person");
  });
});
