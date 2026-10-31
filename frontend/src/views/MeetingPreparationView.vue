<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowReactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  usePreparationDrag,
  type PreparationDragSource,
  type PreparationDropTarget,
} from "../meetings/usePreparationDrag";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import { tours } from "../tours/tours";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import TopicTypeRenderer from "../topics/TopicTypeRenderer.vue";
import TopicFormFields from "../components/TopicFormFields.vue";
import {
  api,
  formatUser,
  meetingLabel,
  toLocalDate,
  type AgendaSection,
  type Meeting,
  type MeetingSuggestion,
  type MeetingTopic,
  type Topic,
  type TopicInput,
  type User,
} from "../api/domain";
import { dateInputFormat, formatDate } from "../i18n";
import { assignableUsers } from "../auth/roles";
import { auth } from "../auth/auth";
import {
  saveMeetingTopicField,
} from "../topics/meetingTopicEdits";
import { topicUsesPlannedDuration } from "../topics/topicTypeRegistry";
import { toTopicInput } from "../topics/types/new-membership/topicInput";
import {
  MeetingCollaborativeTextEditor,
  MeetingWorkspaceStatus,
  useMeetingRoute,
} from "../meetings/workspace";

interface AgendaGroup {
  section: AgendaSection;
  items: MeetingTopic[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const id = route.params.id as string;
const { workspace, operations } = useMeetingRoute(id, (opening) => load(opening));
const meeting = computed(() => workspace.state.meeting as Meeting | null);
const createsAgendaTopic = computed(() => Boolean(
  auth.state.user?.id && auth.state.user.id === meeting.value?.meetingLeaderId,
));
const readOnly = computed(() => meeting.value?.status === "completed");
const sections = ref<AgendaSection[]>([]);
const suggestions = ref<MeetingSuggestion[]>([]);
const futureSuggestions = ref<MeetingSuggestion[]>([]);
const showFutureTopics = ref(false);
const futureTopicsLoading = ref(false);
const users = ref<User[]>([]);
const responsibleUserOptions = computed(() => assignableUsers(users.value));
const grouped = ref<AgendaGroup[]>([]);
const error = ref("");
const pending = ref(false);
const detailsVisible = ref(false);
const startVisible = ref(false);
const starting = ref(false);
const newVisible = ref(false);
const selectedSections = reactive<Record<string, string>>({});
const selectedTopicIds = ref<string[]>([]);
const detailsReadOnly = computed(() => meeting.value?.status === "in_progress");
const detailsForm = reactive({
  title: "",
  date: null as Date | null,
  beginTime: null as Date | null,
  status: "planned",
  meetingLeaderId: null as string | null,
  minuteTakerId: null as string | null,
  generalNotes: "",
  openingInput: "",
});

const initialiseSelectedSection = (
  topic: MeetingSuggestion,
  availableSections: AgendaSection[] = sections.value,
) => {
  const sectionId = topic.previousSectionId
    || topic.defaultSectionId
    || availableSections[0]?.id;
  if (sectionId) selectedSections[topic.id] = sectionId;
};
const statusOptions = computed(() =>
  ["planned", "in_progress"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);
const durationSaveQueues = new Map<string, Promise<void>>();
const visibleSuggestionLists = computed(() => showFutureTopics.value
  ? [suggestions.value, futureSuggestions.value]
  : [suggestions.value]);
const form = reactive({
  name: "",
  description: null as string | null,
  type: "generic" as TopicInput["type"],
  status: "open",
  followUpDate: null as Date | null,
  responsibleUserId: null,
  membershipProcessStatus: null,
  membershipStatusSignal: null,
  godparents: null,
  defaultSectionId: null as string | null,
  defaultPosition: null,
  recurrenceFirstDueDate: null as string | null,
  recurrenceInterval: null as number | null,
  recurrenceUnit: null as "weeks" | "months" | null,
});

const initialiseGroups = () => {
  const orderedSections = [...sections.value].sort(
    (left, right) => left.position - right.position,
  );
  sections.value = orderedSections;
  grouped.value = orderedSections.map((section) => ({
    section,
    items: structuredClone(meeting.value?.agenda ?? [])
      .filter((item) => item.sectionId === section.id)
      .sort((left, right) => left.position - right.position),
  }));
};

const load = async (opening: Promise<void>) => {
  error.value = "";
  try {
    const [
      _workspaceLoaded,
      loadedSections,
      loadedSuggestions,
      loadedUsers,
      loadedFutureSuggestions,
    ] =
      await Promise.all([
        opening,
        api.sections(),
        api.meetingSuggestions(id),
        api.userDirectory(),
        showFutureTopics.value
          ? api.meetingSuggestions(id, { future: true })
          : Promise.resolve([]),
      ]);
    sections.value = loadedSections;
    suggestions.value = loadedSuggestions;
    futureSuggestions.value = loadedFutureSuggestions;
    users.value = loadedUsers;
    for (const topic of [...loadedSuggestions, ...loadedFutureSuggestions]) {
      initialiseSelectedSection(topic, loadedSections);
    }
    initialiseGroups();
  } catch (cause) {
    error.value =
      t("meetingPreparation.loadFailed");
  }
};

const toggleFutureTopics = async () => {
  if (showFutureTopics.value) {
    showFutureTopics.value = false;
    futureSuggestions.value = [];
    return;
  }
  futureTopicsLoading.value = true;
  error.value = "";
  try {
    const loadedFutureSuggestions = await api.meetingSuggestions(id, {
      future: true,
    });
    futureSuggestions.value = loadedFutureSuggestions;
    for (const topic of loadedFutureSuggestions) initialiseSelectedSection(topic);
    showFutureTopics.value = true;
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message
      : t("meetingPreparation.futureLoadFailed");
  } finally {
    futureTopicsLoading.value = false;
  }
};

const normalize = (groups: AgendaGroup[] = grouped.value) =>
  groups.flatMap((group) =>
    group.items.map((item, index) => ({
      id: item.id,
      sectionId: group.section.id,
      position: index + 1,
    })),
  );

watch(() => workspace.state.meeting, () => {
  cancelDrag();
  initialiseGroups();
});

const withOperation = async (action: () => Promise<unknown>) => {
  if (pending.value) return false;
  pending.value = true;
  error.value = "";
  let succeeded = true;
  try {
    await action();
  } catch (cause) {
    succeeded = false;
    error.value =
      cause instanceof Error
        ? cause.message
        : t("meetingPreparation.saveFailed");
  } finally {
    const currentSuggestions = await api.meetingSuggestions(id).catch(() => null);
    if (currentSuggestions) suggestions.value = currentSuggestions;
    initialiseGroups();
    pending.value = false;
  }
  return succeeded;
};

const topicPanel = ref<HTMLElement | null>(null);
const availablePanelHeight = ref<string>();
const fitTopicPanel = () => {
  if (!topicPanel.value) return;
  const top = Math.max(0, topicPanel.value.getBoundingClientRect().top);
  availablePanelHeight.value = `${Math.max(120, window.innerHeight - top - 16)}px`;
};
watch(topicPanel, () => {
  void nextTick(fitTopicPanel);
});
onMounted(() => {
  window.addEventListener("scroll", fitTopicPanel, true);
  window.addEventListener("resize", fitTopicPanel);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", fitTopicPanel, true);
  window.removeEventListener("resize", fitTopicPanel);
});

const preparationRoot = ref<HTMLElement | null>(null);
const dragDisabled = computed(() => pending.value || readOnly.value);
const commitDrag = async (source: PreparationDragSource, target: PreparationDropTarget) => {
  if (dragDisabled.value) return false;
  const destination = grouped.value.find((group) => group.section.id === target.sectionId);
  if (!destination) return false;
  if (source.kind === "suggestion") {
    const topic = visibleSuggestionLists.value.flat().find((topic) => topic.id === source.id);
    if (!topic) return false;
    return withOperation(() => operations.addTopic({
      topicId: topic.id,
      sectionId: destination.section.id,
      position: target.index + 1,
      topic,
    }));
  }
  const proposed = grouped.value.map((group) => ({ ...group, items: [...group.items] }));
  const origin = proposed.find((group) => group.items.some((item) => item.id === source.id));
  const proposedDestination = proposed.find((group) => group.section.id === target.sectionId)!;
  const index = origin?.items.findIndex((item) => item.id === source.id) ?? -1;
  if (!origin || index < 0) return false;
  if (origin === proposedDestination && index === target.index) return true;
  const [item] = origin.items.splice(index, 1);
  proposedDestination.items.splice(target.index, 0, item!);
  return withOperation(() => operations.reorderAgenda(normalize(proposed)));
};
const {
  floating: draggedTopic,
  pointer: dragPointer,
  target: dropTarget,
  agendaHeight,
  start: startDrag,
  cancel: cancelDrag,
} = usePreparationDrag(preparationRoot, dragDisabled, commitDrag);

// Renderers have one stable keyed parent. Teleport moves their DOM between section
// hosts without discarding local drafts, failed-save values, or collaboration bindings.
const agendaItems = computed(() => grouped.value.flatMap((group) => group.items));
const agendaHosts = shallowReactive<Record<string, HTMLElement>>({});
const setAgendaHost = (id: string, element: unknown) => {
  // Keep the previous target until the replacement host mounts during a section move.
  if (element instanceof HTMLElement) agendaHosts[id] = element;
};
watch(agendaItems, (items) => {
  const ids = new Set(items.map((item) => item.id));
  for (const id of Object.keys(agendaHosts)) {
    if (!ids.has(id)) delete agendaHosts[id];
  }
});
const groupFor = (item: MeetingTopic) => grouped.value.find((group) =>
  group.items.some((candidate) => candidate.id === item.id),
)!;

const insertionBefore = (group: AgendaGroup, item: MeetingTopic) => {
  if (dropTarget.value?.sectionId !== group.section.id) return false;
  const items = group.items.filter((candidate) => candidate.id !== draggedTopic.value?.id);
  return items.indexOf(item) === dropTarget.value.index;
};
const insertionAtEnd = (group: AgendaGroup) => dropTarget.value?.sectionId === group.section.id
  && dropTarget.value.index === group.items.filter((item) => item.id !== draggedTopic.value?.id).length;

const selectedTopics = computed(() => visibleSuggestionLists.value
  .flat()
  .filter((topic) => selectedTopicIds.value.includes(topic.id)));

const isSelected = (topic: Topic) => selectedTopicIds.value.includes(topic.id);

const toggleSelected = (topic: Topic) => {
  selectedTopicIds.value = isSelected(topic)
    ? selectedTopicIds.value.filter((id) => id !== topic.id)
    : [...selectedTopicIds.value, topic.id];
};

const sectionFor = (topic: Topic & Partial<MeetingSuggestion>) => selectedSections[topic.id]
  || topic.previousSectionId
  || topic.defaultSectionId
  || sections.value[0]?.id;

const addSelected = async () => {
  const additions = selectedTopics.value.flatMap((topic) => {
    const sectionId = sectionFor(topic);
    return sectionId ? [{ topicId: topic.id, sectionId, topic }] : [];
  });
  if (!additions.length) return;
  const succeeded = await withOperation(() => operations.addTopics(additions));
  if (succeeded) selectedTopicIds.value = [];
};

const remove = async (item: MeetingTopic) => {
  await withOperation(() => operations.removeTopic(item.id));
};

const saveDuration = async (item: MeetingTopic, duration: number | null) => {
  const normalizedDuration = duration && duration > 0 ? duration : null;
  if (item.plannedDuration === normalizedDuration) return;

  const previousDuration = item.plannedDuration;
  item.plannedDuration = normalizedDuration;
  error.value = "";

  const precedingSave = durationSaveQueues.get(item.id) ?? Promise.resolve();
  const currentSave = precedingSave
    .catch(() => undefined)
    .then(async () => {
      try {
        await operations.updateAppearance(item.id, {
          plannedDuration: normalizedDuration,
        });
      } catch (cause) {
        if (item.plannedDuration === normalizedDuration)
          item.plannedDuration = previousDuration;
        error.value =
          cause instanceof Error
            ? cause.message
            : t("meetingPreparation.durationFailed");
      }
    })
    .finally(() => {
      if (durationSaveQueues.get(item.id) === currentSave)
        durationSaveQueues.delete(item.id);
    });

  durationSaveQueues.set(item.id, currentSave);
  await currentSave;
};

const sectionDuration = (items: MeetingTopic[]) =>
  items.reduce(
    (total, item) =>
      total +
      (topicUsesPlannedDuration(item.topic?.type ?? "")
        ? (item.plannedDuration ?? 0)
        : 0),
    0,
  );

const createAndAdd = async () => {
  const succeeded = await withOperation(async () => {
    const topic = await api.createTopic(toTopicInput({
      ...form,
      followUpDate: toLocalDate(form.followUpDate),
    }));
    const sectionId = form.defaultSectionId || sections.value[0]?.id;
    if (createsAgendaTopic.value && sectionId) {
      await operations.addTopic({ topicId: topic.id, sectionId, topic });
    } else if (topic.type === "recurring") {
      await workspace.refresh();
    }
  });
  if (succeeded) newVisible.value = false;
};

const startMeeting = async () => {
  if (starting.value || !meeting.value) return;
  starting.value = true;
  try {
    await operations.updateMeeting({ status: "in_progress" });
    startVisible.value = false;
    await router.push(`/meetings/${id}`);
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message
      : t("meetingPreparation.startFailed");
  } finally {
    starting.value = false;
  }
};

const timeToDate = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};
const toLocalTime = (value: Date) =>
  `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
const openDetails = () => {
  if (!meeting.value) return;
  Object.assign(detailsForm, {
    title: meeting.value.title ?? "",
    date: new Date(`${meeting.value.date}T12:00:00`),
    beginTime: timeToDate(meeting.value.beginTime),
    status: meeting.value.status,
    meetingLeaderId: meeting.value.meetingLeaderId,
    minuteTakerId: meeting.value.minuteTakerId,
    generalNotes: meeting.value.generalNotes ?? "",
    openingInput: meeting.value.openingInput ?? "",
  });
  detailsVisible.value = true;
};
const saveDetails = async () => {
  if (!meeting.value || !detailsForm.date || !detailsForm.beginTime) return;
  const date = detailsForm.date;
  const beginTime = detailsForm.beginTime;
  await withOperation(() => operations.updateMeeting({
    date: toLocalDate(date)!,
    beginTime: toLocalTime(beginTime),
    status: detailsForm.status,
    meetingLeaderId: detailsForm.meetingLeaderId,
    minuteTakerId: detailsForm.minuteTakerId,
    ...(!detailsReadOnly.value ? {
      title: detailsForm.title.trim() || null,
      generalNotes: detailsForm.generalNotes || null,
      openingInput: detailsForm.openingInput || null,
    } : {}),
  }));
  detailsVisible.value = false;
};

</script>

<template>
  <section ref="preparationRoot" class="page">
    <MeetingWorkspaceStatus />
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="meeting">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ t("meetingPreparation.eyebrow") }}</p>
          <h1>{{ meetingLabel(meeting) }}</h1>
          <p>{{ t("meetingPreparation.description") }}</p>
        </div>
        <div class="header-actions">
          <Button
            icon="pi pi-pencil"
            :label="t('meetingAgenda.editDetails')"
            size="small"
            text
            @click="openDetails"
          />
          <Button
            v-if="meeting.status === 'planned' && !readOnly"
            icon="pi pi-play"
            :label="t('meetingPreparation.start')"
            @click="startVisible = true"
          />
          <RouterLink :to="`/meetings/${id}`">
            <Button
              icon="pi pi-arrow-right"
              icon-pos="right"
              :label="t('meetingPreparation.openAgenda')"
              size="small"
              text
            />
          </RouterLink>
        </div>
      </header>
      <div :class="['layout', { 'layout-read-only': readOnly }]">
        <main
          :class="{ 'agenda-compacting': draggedTopic }"
          :style="draggedTopic ? { minHeight: `${agendaHeight}px` } : undefined"
        >
          <section
            v-for="group in grouped"
            :key="group.section.id"
            class="section"
            :class="{ 'drop-destination': dropTarget?.sectionId === group.section.id }"
          >
            <h2>
              {{ group.section.name }}
              <span class="section-meta">
                <span>
                  {{ sectionDuration(group.items) }}
                  {{ t("common.minuteShort") }}
                </span>
                <Tag :value="String(group.items.length)" severity="secondary" />
              </span>
            </h2>
            <div class="agenda-drop-zone" :data-agenda-section="group.section.id">
              <div
                v-for="item in group.items"
                :key="item.id"
                :ref="(element) => setAgendaHost(item.id, element)"
                class="agenda-item-host"
              />
              <div v-if="insertionAtEnd(group)" class="insertion-line" />
              <p v-if="!group.items.length" class="empty">
                {{ t("meetingPreparation.noTopics") }}
              </p>
            </div>
          </section>
        </main>
        <aside v-if="!readOnly" ref="topicPanel" :style="{ maxHeight: availablePanelHeight }">
          <div class="suggestions-heading">
            <div>
              <h2>{{ t("meetingPreparation.addTopics") }}</h2>
              <p>{{ t("meetingPreparation.suggestions") }}</p>
            </div>
            <Button
              :aria-label="t('topics.createTitle')"
              :label="t('topics.createTitle')"
              class="create-topic-button"
              icon="pi pi-plus"
              size="small"
              @click="newVisible = true"
            />
          </div>
          <div class="suggestions-list">
            <template
              v-for="(suggestionList, suggestionListIndex) in visibleSuggestionLists"
              :key="suggestionListIndex === 0 ? 'due' : 'future'"
            >
              <div :class="{ 'future-suggestions': suggestionListIndex === 1 }">
                <article
                  v-for="topic in suggestionList"
                  :key="topic.id"
                  class="suggestion"
                  :class="{ 'suggestion-selected': isSelected(topic) }"
                >
                  <div class="suggestion-title">
                    <button
                      class="drag-handle"
                      type="button"
                      :aria-label="t('meetingPreparation.drag')"
                      :title="t('meetingPreparation.drag')"
                      :disabled="pending"
                      @pointerdown="startDrag($event, { kind: 'suggestion', id: topic.id, title: topic.name })"
                      @dragstart.prevent
                    >
                      <span v-for="dot in 6" :key="dot" />
                    </button>
                    <div>
                      <TopicTypeRenderer
                        :type="topic.type"
                        context="preparation"
                        :topic="topic"
                        show-type
                      />
                    </div>
                    <Tag
                      v-if="topic.isNew"
                      class="new-topic-tag"
                      :value="t('meetingPreparation.newTopic')"
                      severity="danger"
                    />
                  </div>
                  <Select
                    v-model="selectedSections[topic.id]"
                    :aria-label="t('meetingPreparation.chooseSection')"
                    :disabled="pending"
                    size="small"
                    :options="sections"
                    :placeholder="
                      topic.defaultSection?.name ||
                      t('meetingPreparation.chooseSection')
                    "
                    option-label="name"
                    option-value="id"
                  />
                  <Button
                    :icon="isSelected(topic) ? 'pi pi-minus' : 'pi pi-plus'"
                    :aria-label="isSelected(topic)
                      ? t('meetingPreparation.removeFromPreselection')
                      : t('meetingPreparation.markForAgenda')"
                    :title="isSelected(topic)
                      ? t('meetingPreparation.removeFromPreselection')
                      : t('meetingPreparation.markForAgenda')"
                    :aria-pressed="isSelected(topic)"
                    class="select-topic-button"
                    size="small"
                    outlined
                    :disabled="pending"
                    :severity="isSelected(topic) ? 'secondary' : undefined"
                    @click="toggleSelected(topic)"
                  />
                </article>
              </div>
              <p v-if="!suggestionList.length" class="empty">
                {{
                  suggestionListIndex === 0
                    ? t("meetingPreparation.allAdded")
                    : t("meetingPreparation.noFutureTopics")
                }}
              </p>
              <Button
                v-if="suggestionListIndex === 0"
                class="future-topics-toggle"
                :label="showFutureTopics
                  ? t('meetingPreparation.hideFutureTopics')
                  : t('meetingPreparation.showFutureTopics')"
                :loading="futureTopicsLoading"
                :disabled="pending || futureTopicsLoading"
                severity="secondary"
                outlined
                @click="toggleFutureTopics"
              />
            </template>
          </div>
          <Button
            v-if="selectedTopics.length"
            class="add-selected-topics"
            icon="pi pi-check"
            :label="t('meetingPreparation.addSelectedToAgenda', {
              count: selectedTopics.length,
            })"
            :disabled="pending"
            :loading="pending"
            @click="addSelected"
          />
        </aside>
      </div>
    </template>
    <template v-for="item in agendaItems" :key="item.id">
      <Teleport v-if="agendaHosts[item.id]" :to="agendaHosts[item.id]">
        <article
          :data-agenda-item="item.id"
          :data-topic-id="item.topicId"
          :class="{
            'standard-preparation': topicUsesPlannedDuration(item.topic?.type ?? ''),
            'insertion-before': insertionBefore(groupFor(item), item),
            'drag-source': draggedTopic?.kind === 'agenda' && draggedTopic.id === item.id,
          }"
        >
          <button
            v-if="!readOnly"
            class="drag-handle"
            type="button"
            :aria-label="t('meetingPreparation.drag')"
            :title="t('meetingPreparation.drag')"
            :disabled="pending"
            @pointerdown="startDrag($event, { kind: 'agenda', id: item.id, title: item.topic?.name ?? '' })"
            @dragstart.prevent
          >
            <span v-for="dot in 6" :key="dot" />
          </button>
          <span v-if="draggedTopic" class="compact-topic-title">{{ item.topic?.name }}</span>
          <div v-show="!draggedTopic" v-if="item.topic" class="topic-content">
            <TopicTypeRenderer
              :type="item.topic.type"
              context="preparation"
              :topic="item.topic"
              :item="item"
              :read-only="readOnly"
              :meeting-status="meeting?.status"
              :users="responsibleUserOptions"
              :save-field="saveMeetingTopicField(operations, item)"
            >
              <template v-if="topicUsesPlannedDuration(item.topic.type)">
                <div v-if="!readOnly" class="item-actions">
                  <div class="duration-control">
                    <InputNumber
                      :model-value="item.plannedDuration"
                      :aria-label="t('meetingPreparation.duration')"
                      :disabled="pending"
                      :invalid="item.plannedDuration === null"
                      :min="0"
                      :step="5"
                      :suffix="` ${t('common.minuteShort')}`"
                      show-buttons
                      size="small"
                      @update:model-value="saveDuration(item, $event)"
                    />
                  </div>
                  <Button
                    :disabled="pending"
                    :aria-label="item.source === 'recurrence'
                      ? t('recurringTopic.skip')
                      : t('meetingPreparation.remove')"
                    :title="item.source === 'recurrence'
                      ? t('recurringTopic.skip')
                      : t('meetingPreparation.remove')"
                    icon="pi pi-times"
                    rounded
                    severity="danger"
                    text
                    @click="remove(item)"
                  />
                </div>
                <div
                  v-else
                  class="topic-duration"
                >
                  {{ item.plannedDuration ?? 0 }}
                  {{ t("common.minuteShort") }}
                </div>
              </template>
            </TopicTypeRenderer>
            <small v-if="item.topic?.followUpDate">
              {{ t("topics.followUp") }}
                {{ formatDate(`${item.topic.followUpDate}T12:00:00`) }}
            </small>
          </div>
          <div
            v-show="!draggedTopic"
            v-if="!readOnly && !topicUsesPlannedDuration(item.topic?.type ?? '')"
            class="item-actions"
          >
            <Button
              :disabled="pending"
              :aria-label="item.source === 'recurrence'
                ? t('recurringTopic.skip')
                : t('meetingPreparation.remove')"
              :title="item.source === 'recurrence'
                ? t('recurringTopic.skip')
                : t('meetingPreparation.remove')"
              icon="pi pi-times"
              rounded
              severity="danger"
              text
              @click="remove(item)"
            />
          </div>
        </article>
      </Teleport>
    </template>
    <Teleport to="body">
      <div
        v-if="draggedTopic"
        class="floating-topic"
        :style="{ left: `${dragPointer.x + 12}px`, top: `${dragPointer.y + 12}px` }"
        aria-hidden="true"
      >
        {{ draggedTopic.title }}
      </div>
    </Teleport>
    <Dialog
      v-if="!readOnly"
      v-model:visible="detailsVisible"
      :style="{ width: '48rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="t('meetingAgenda.editTitle')"
      modal
    >
      <form id="edit-meeting-details" class="form" @submit.prevent="saveDetails">
        <div class="row">
          <label>
            <span>{{ t('meetings.specialTitle') }}</span>
            <InputText
              v-model="detailsForm.title"
              :disabled="detailsReadOnly"
              :placeholder="t('meetingAgenda.exampleTitle')"
            />
          </label>
          <label>
            <span>{{ t('common.date') }}</span>
            <DatePicker
              v-model="detailsForm.date"
              :date-format="dateInputFormat()"
              icon="pi pi-calendar"
              icon-display="input"
              required
              show-icon
            />
          </label>
          <label>
            <span>{{ t('meetingAgenda.beginTime') }}</span>
            <DatePicker
              v-model="detailsForm.beginTime"
              :step-minute="15"
              hour-format="24"
              icon="pi pi-clock"
              icon-display="input"
              required
              show-icon
              time-only
            />
          </label>
          <label>
            <span>{{ t('common.status') }}</span>
            <Select
              v-model="detailsForm.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
            />
          </label>
        </div>
        <div class="row">
          <label>
            <span>{{ t('meetingAgenda.leader') }}</span>
            <Select
              v-model="detailsForm.meetingLeaderId"
              :options="responsibleUserOptions"
              option-label="firstName"
              option-value="id"
              :placeholder="t('meetingAgenda.selectLeader')"
              show-clear
            >
              <template #option="{ option }">{{ formatUser(option) }}</template>
            </Select>
          </label>
          <label>
            <span>{{ t('meetingAgenda.minuteTaker') }}</span>
            <Select
              v-model="detailsForm.minuteTakerId"
              :options="responsibleUserOptions"
              option-label="firstName"
              option-value="id"
              :placeholder="t('meetingAgenda.selectMinuteTaker')"
              show-clear
            >
              <template #option="{ option }">{{ formatUser(option) }}</template>
            </Select>
          </label>
        </div>
        <label>
          <span>{{ t('meetingAgenda.opening') }}</span>
          <MeetingCollaborativeTextEditor
            v-model="detailsForm.openingInput"
            :target="{ kind: 'opening_input' }"
            height="100px"
            :placeholder="t('meetingAgenda.opening')"
            :readonly="detailsReadOnly"
          />
        </label>
        <label>
          <span>{{ t('meetingAgenda.generalNotes') }}</span>
          <MeetingCollaborativeTextEditor
            v-model="detailsForm.generalNotes"
            :target="{ kind: 'general_notes' }"
            height="100px"
            :placeholder="t('meetingAgenda.generalNotes')"
            :readonly="detailsReadOnly"
          />
        </label>
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="detailsVisible = false"
        />
        <Button
          form="edit-meeting-details"
          icon="pi pi-check"
          :label="t('meetingAgenda.saveDetails')"
          type="submit"
        />
      </template>
    </Dialog>
    <Dialog
      v-if="!readOnly"
      v-model:visible="newVisible"
      :style="{ width: '46rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="createsAgendaTopic
        ? t('meetingPreparation.createAndAddTitle')
        : t('topics.createTitle')"
      :modal="tours.state.activeId !== 'new-topic-dialog'"
    >
      <Message v-if="error" class="topic-create-error" severity="error" role="alert">
        {{ error }}
      </Message>
      <form id="new-topic" class="form" @submit.prevent="createAndAdd">
        <TopicFormFields
          id="new-topic"
          :model-value="form"
          :users="users"
          :sections="sections"
          tour-enabled
          :active="newVisible"
          :error="error"
          initialize-defaults
          section-required
          @change="Object.assign(form, $event)"
        />
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="newVisible = false"
        />
        <Button
          form="new-topic"
          :label="createsAgendaTopic
            ? t('meetingPreparation.createAndAdd')
            : t('topics.createTitle')"
          :loading="pending"
          type="submit"
        />
      </template>
    </Dialog>
    <Dialog
      v-if="!readOnly"
      v-model:visible="startVisible"
      :header="t('meetingPreparation.startTitle')"
      modal
    >
      <p>{{ t("meetingPreparation.startWarning") }}</p>
      <template #footer>
        <Button :label="t('common.cancel')" text @click="startVisible = false" />
        <Button
          :disabled="starting"
          :label="t('meetingPreparation.confirmStart')"
          @click="startMeeting"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.page {
  max-width: 1300px;
  margin: 0 auto;
}
.eyebrow {
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -0.04em;
}
.page-header p:last-child,
.suggestions-heading p {
  margin: 0.45rem 0 0;
  color: #68758a;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.8fr);
  gap: 1.25rem;
  align-items: start;
}
.layout-read-only {
  grid-template-columns: minmax(0, 1fr);
}
.section {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.75rem;
  background: #fff;
}
.section h2,
.suggestions-heading h2 {
  margin: 0;
  font-size: 1rem;
}
.section h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid #e9edf2;
}
.section-meta {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #718096;
  font-size: 0.8rem;
  font-weight: 600;
}
.agenda-drop-zone {
  min-height: 3.25rem;
}
.section article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) max-content;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid #edf0f4;
}
.agenda-item-host:last-of-type article {
  border: 0;
}
.topic-content {
  min-width: 0;
}
.standard-preparation .topic-content {
  grid-column: 2 / -1;
}
.item-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  min-width: 0;
}
.duration-control {
  width: 5.75rem;
  min-width: 0;
  --p-inputnumber-button-width: 1.35rem;
}
.duration-control :deep(.p-inputnumber) {
  width: 100%;
  min-width: 0;
}
.duration-control :deep(.p-inputnumber-input) {
  width: 0;
  min-width: 0;
}
.section small,
.suggestion small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
  font-size: 0.75rem;
}
.drag-handle {
  display: grid;
  grid-template-columns: repeat(2, 3px);
  gap: 3px;
  width: 20px;
  padding: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: grab;
  touch-action: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.drag-handle:focus-visible {
  outline: 2px solid #3867c8;
  outline-offset: 2px;
}
.drag-handle span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #718096;
}
.suggestions-heading,
.suggestion-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.suggestions-heading {
  margin-bottom: 0.8rem;
}
.create-topic-button {
  flex-shrink: 0;
}
.layout aside {
  position: sticky;
  top: calc(2.6rem + 1rem);
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 5rem);
  min-width: 0;
  padding: 1rem;
  border: 1px solid #d8e0ec;
  border-radius: 0.75rem;
  background: #eef3fa;
}
.suggestion {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin-bottom: 0.45rem;
  padding: 0.55rem;
  border-radius: 0.6rem;
  background: #fff;
}
.future-topics-toggle {
  width: 100%;
  margin: 0.2rem 0 0.7rem;
}
.suggestion-title {
  grid-column: 1 / -1;
  min-width: 0;
  justify-content: flex-start;
  gap: 0.45rem;
}
.suggestion-title > div {
  flex: 1;
  min-width: 0;
}
.suggestion :deep(.p-select) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.suggestions-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.suggestions-heading {
  flex-wrap: wrap;
  gap: 0.6rem;
  flex-shrink: 0;
}
.add-selected-topics {
  flex-shrink: 0;
  margin-top: 0.5rem;
}
.suggestion-selected {
  box-shadow: inset 0 0 0 2px #3867c8;
}
.select-topic-button {
  width: 2rem;
  height: 2rem;
}
.agenda-compacting {
  overflow-anchor: none;
}
.agenda-compacting article {
  position: relative;
  min-height: 2.75rem;
  padding: 0.5rem 0;
}
.compact-topic-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drag-source {
  opacity: 0.4;
}
.drop-destination {
  border-color: #3867c8;
}
.insertion-before::before,
.insertion-line {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: #3867c8;
}
.insertion-before::before {
  position: absolute;
  top: -2px;
  right: 0;
  left: 0;
  content: "";
}
.floating-topic {
  position: fixed;
  z-index: 10000;
  max-width: min(24rem, 70vw);
  overflow: hidden;
  padding: 0.6rem 0.85rem;
  border: 1px solid #3867c8;
  border-radius: 0.5rem;
  background: #fff;
  box-shadow: 0 4px 16px #17243a33;
  color: #17243a;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.empty {
  color: #8490a3;
  font-style: italic;
}
.form,
.form label {
  display: grid;
  gap: 0.45rem;
}
.form {
  gap: 1rem;
}
.form label > span {
  font-size: 0.86rem;
  font-weight: 650;
}
.form :deep(input),
.form :deep(.p-select) {
  width: 100%;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .layout aside {
    position: static;
  }
}
@media (max-width: 650px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
  .section article {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
