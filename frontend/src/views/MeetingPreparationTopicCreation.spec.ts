import { Decoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrimeVue from "primevue/config";
import { setLanguage } from "../i18n";
import { auth } from "../auth/auth";
import { api, type Meeting, type MeetingTopic } from "../api/domain";
import { scalarSession } from "../e2ee/scalar-session";
import { meetingDocumentSession } from "../e2ee/meeting-document-session";
import { createMeetingWorkspace, meetingRouteFactoryKey } from "../meetings/workspace";
import { createMeetingRouteOperations } from "../meetings/workspace/production-adapter";
import MeetingPreparationView from "./MeetingPreparationView.vue";

enableAutoUnmount(afterEach);

const meetingId = "00000000-0000-4000-8000-000000000108";
const leaderId = "00000000-0000-4000-8000-000000000109";
const memberId = "00000000-0000-4000-8000-000000000110";
const sectionId = "00000000-0000-4000-8000-000000000111";

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "00000000-0000-4000-8000-000000000108" } }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("creating topics from meeting preparation", () => {
  let meeting: Meeting;
  let topics: Array<Record<string, any>>;
  let agenda: MeetingTopic[];

  beforeEach(async () => {
    const statusTarget = document.createElement("div");
    statusTarget.id = "meeting-workspace-status";
    document.body.append(statusTarget);
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(5), "uint8array");
    const keys = {
      organizationId: "00000000-0000-4000-8000-000000000112",
      ockId: "00000000-0000-4000-8000-000000000113",
      clientEpochId: "00000000-0000-4000-8000-000000000114",
      noncePrefix: new Uint8Array(16).fill(7),
      contentKey: new Uint8Array(32).fill(11),
      signingPrivateKey: signing.privateKey,
    };
    scalarSession.unlock(keys);
    meetingDocumentSession.unlock(keys);
    await meetingDocumentSession.createInitial(meetingId);
    meeting = {
      id: meetingId, title: "Council", date: "2026-10-20", beginTime: "19:30",
      status: "planned", meetingLeaderId: leaderId, agenda: [],
    } as unknown as Meeting;
    topics = [];
    agenda = [];
    auth.state.user = { id: memberId, role: "user", permissions: { topics: "manage", meetings: "manage" } } as any;
    vi.stubGlobal("fetch", vi.fn(async (path: string, options?: RequestInit) => {
      const url = new URL(path, "http://localhost");
      let result: unknown;
      if (url.pathname === "/api/agenda-sections") {
        result = [{ id: sectionId, name: "Discussion", position: 1, defaultTopicType: "generic" }];
      } else if (url.pathname === `/api/meetings/${meetingId}`) {
        result = { ...meeting, agenda };
      } else if (url.pathname === "/api/user-directory") {
        result = [];
      } else if (url.pathname === "/api/topics" && options?.method === "POST") {
        const topic = JSON.parse(options.body as string);
        topics.push(topic);
        result = topic;
      } else if (url.pathname === `/api/meetings/${meetingId}/suggestions`) {
        result = topics.filter((topic) => !agenda.some((item) => item.topicId === topic.id))
          .map((topic) => ({ ...topic, isNew: true }));
      } else if (url.pathname.endsWith("/appearances")) {
        result = [];
      } else if (url.pathname.endsWith("/recurrence-reconciliation")) {
        result = {
          moves: [{ meetingId, sectionId, position: 1 }],
          removals: [],
        };
      } else if (url.pathname === `/api/meetings/${meetingId}/topics` && options?.method === "POST") {
        const [id, , topicId, section] = new Decoder({ mapsAsObjects: false }).decode(options.body as Uint8Array);
        const item = {
          id, meetingId, topicId, sectionId: section, position: agenda.length + 1,
          topic: topics.find((topic) => topic.id === topicId),
        } as MeetingTopic;
        agenda.push(item);
        result = item;
      } else {
        throw new Error(`Unexpected request: ${options?.method ?? "GET"} ${path}`);
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => result } as Response;
    }));
  });

  afterEach(() => {
    document.getElementById("meeting-workspace-status")?.remove();
    auth.state.user = null;
    scalarSession.lock();
    meetingDocumentSession.lock();
    vi.unstubAllGlobals();
  });

  async function openCreationDialog() {
    const factory = () => {
      const workspace = createMeetingWorkspace(meetingId, {
        load: async () => ({
          meeting: await api.meeting(meetingId),
          unlocked: false,
          collaborative: false,
        }),
        complete: async () => meeting,
        updateText: async () => undefined,
      });
      return {
        workspace,
        opened: workspace.open(),
        operations: createMeetingRouteOperations(meetingId, () => workspace.refresh()),
      };
    };
    const wrapper = mount(MeetingPreparationView, {
      global: {
        plugins: [PrimeVue],
        provide: { [meetingRouteFactoryKey as symbol]: factory },
        stubs: {
          DatePicker: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template: `<input type="date" @input="$emit('update:modelValue', new Date($event.target.value + 'T12:00:00'))" />`,
          },
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            emits: ["update:modelValue"],
            template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
              <option value="" />
              <option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option>
            </select>`,
          },
          Dialog: {
            props: ["visible", "header"],
            template: '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Draggable: {
            props: ["list"],
            template: '<div><slot v-for="element in list" name="item" :element="element" /><slot name="footer" /></div>',
          },
        },
      },
    });
    await flushPromises();
    await wrapper.get('[aria-label="Create topic"]').trigger("click");
    await flushPromises();
    return wrapper;
  }

  it.each(["user", "admin", "superadmin"])("creates a non-leader %s's topic as a suggestion without adding it to the agenda", async (role) => {
    auth.state.user!.role = role as "user" | "admin" | "superadmin";
    meeting.minuteTakerId = memberId;
    const wrapper = await openCreationDialog();
    await wrapper.get('#new-topic input[required]').setValue("A new discussion");
    await wrapper.get("#new-topic").trigger("submit");
    await flushPromises();

    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false));
    expect(topics[0]!.defaultSectionId).toBe(sectionId);
    expect(wrapper.get("aside").text()).toContain("A new discussion");
    expect(wrapper.get("main").text()).not.toContain("A new discussion");
  });

  it("offers topic creation without promising an agenda addition for non-leaders in both languages", async () => {
    const wrapper = await openCreationDialog();
    expect(wrapper.get('[role="dialog"] h2').text()).toBe("Create topic");
    expect(wrapper.get('button[form="new-topic"]').text()).toBe("Create topic");

    setLanguage("de");
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="dialog"] h2').text()).toBe("Thema erstellen");
    expect(wrapper.get('button[form="new-topic"]').text()).toBe("Thema erstellen");
  });

  it("lets the assigned leader create a topic directly on the agenda", async () => {
    auth.state.user!.id = leaderId;
    const wrapper = await openCreationDialog();
    expect(wrapper.get('[role="dialog"] h2').text()).toBe("Create and add topic");
    expect(wrapper.get('button[form="new-topic"]').text()).toBe("Create and add");
    await wrapper.get('#new-topic input[required]').setValue("Leader discussion");
    await wrapper.get("#new-topic").trigger("submit");

    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false));
    expect(wrapper.get("main").text()).toContain("Leader discussion");
    expect(wrapper.get("aside").text()).not.toContain("Leader discussion");
  });

  it("creates only a suggested topic when no meeting leader is assigned", async () => {
    meeting.meetingLeaderId = null;
    const wrapper = await openCreationDialog();
    expect(wrapper.get('button[form="new-topic"]').text()).toBe("Create topic");
    await wrapper.get('#new-topic input[required]').setValue("Awaiting a leader");
    await wrapper.get("#new-topic").trigger("submit");

    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false));
    expect(wrapper.get("aside").text()).toContain("Awaiting a leader");
    expect(wrapper.get("main").text()).not.toContain("Awaiting a leader");
  });

  it("preserves automatic recurrence scheduling for a topic created by a non-leader", async () => {
    const wrapper = await openCreationDialog();
    await wrapper.get('[data-tour-id="topic-type-recurring"]').trigger("click");
    await wrapper.get('#new-topic input.p-inputtext[required]').setValue("Monthly review");
    await wrapper.get('#new-topic select[aria-label="Default section"]').setValue(sectionId);
    await wrapper.get('#new-topic input[type="date"]').setValue("2026-10-20");
    await wrapper.get('#new-topic input[aria-label="Repeat every"]').setValue("1");
    await wrapper.get('#new-topic select[aria-label="Repeat unit"]').setValue("months");
    expect(wrapper.get('button[form="new-topic"]').text()).toBe("Create topic");
    await wrapper.get("#new-topic").trigger("submit");

    await vi.waitFor(() => expect(wrapper.find('[role="dialog"]').exists()).toBe(false));
    expect(wrapper.get("main").text()).toContain("Monthly review");
    expect(wrapper.get("aside").text()).not.toContain("Monthly review");
    expect(wrapper.findAll("main .standard-preparation")).toHaveLength(1);
  });
});
