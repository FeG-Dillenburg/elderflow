<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";
import Draggable from "vuedraggable";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import TopicTypeRenderer from "../topics/TopicTypeRenderer.vue";
import TopicTypeRadioGroup from "../topics/components/TopicTypeRadioGroup.vue";
import {
  api,
  formatUser,
  meetingLabel,
  type AgendaSection,
  type Meeting,
  type MeetingTopic,
  type Topic,
  type TopicInput,
  type User,
} from "../api/domain";
import { formatDate } from "../i18n";
import { topicNameTranslationKey } from "../topics/topicTypes";
import { assignableUsers } from "../auth/roles";
import { saveMeetingTopicField, saveMeetingTopicNote } from "../topics/meetingTopicEdits";
import { topicUsesPlannedDuration } from "../topics/topicTypeRegistry";
import { toTopicInput } from "../topics/types/new-membership/topicInput";

interface AgendaGroup {
  section: AgendaSection;
  items: MeetingTopic[];
}

type SuggestionClone = Topic & {
  temporaryKey: string;
};

const route = useRoute();
const { t } = useI18n();
const statusLabel = (value?: string) => (value ? t(`labels.${value}`) : "");
const id = route.params.id as string;
const meeting = ref<Meeting | null>(null);
const readOnly = computed(() => meeting.value?.status === "completed");
const sections = ref<AgendaSection[]>([]);
const suggestions = ref<Topic[]>([]);
const users = ref<User[]>([]);
const responsibleUserOptions = computed(() => assignableUsers(users.value));
const grouped = ref<AgendaGroup[]>([]);
const error = ref("");
const pending = ref(false);
const newVisible = ref(false);
const selectedSections = reactive<Record<string, string>>({});
const agendaGroup = { name: "agenda-topics", pull: true, put: true };
const suggestionGroup = { name: "agenda-topics", pull: "clone", put: false };
let temporaryKey = 0;
const durationSaveQueues = new Map<string, Promise<void>>();
const form = reactive({
  name: "",
  description: null as string | null,
  type: "generic" as TopicInput["type"],
  status: "open",
  followUpDate: null,
  responsibleUserId: null,
  membershipProcessStatus: null,
  membershipStatusSignal: null,
  godparents: null,
  defaultSectionId: null as string | null,
  defaultPosition: null,
});

const initialiseGroups = () => {
  const orderedSections = [...sections.value].sort(
    (left, right) => left.position - right.position,
  );
  sections.value = orderedSections;
  grouped.value = orderedSections.map((section) => ({
    section,
    items: (meeting.value?.agenda ?? [])
      .filter((item) => item.sectionId === section.id)
      .sort((left, right) => left.position - right.position),
  }));
};

const load = async () => {
  try {
    const [loadedMeeting, loadedSections, loadedSuggestions, loadedUsers] =
      await Promise.all([
        api.meeting(id),
        api.sections(),
        api.meetingSuggestions(id),
        api.userDirectory(),
      ]);
    meeting.value = loadedMeeting;
    sections.value = loadedSections;
    suggestions.value = loadedSuggestions;
    users.value = loadedUsers;
    initialiseGroups();
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : t("meetingPreparation.loadFailed");
  }
};

const normalize = () =>
  grouped.value.flatMap((group) =>
    group.items.map((item, index) => ({
      id: item.id,
      sectionId: group.section.id,
      position: index + 1,
    })),
  );

const applyNormalization = () => {
  for (const group of grouped.value) {
    group.items.forEach((item, index) => {
      item.sectionId = group.section.id;
      item.position = index + 1;
    });
  }
};

const withReload = async (action: () => Promise<unknown>) => {
  if (pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    await action();
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : t("meetingPreparation.saveFailed");
  } finally {
    await load();
    pending.value = false;
  }
};

const persistOrder = async () => {
  applyNormalization();
  await withReload(() => api.reorderMeetingTopics(id, normalize()));
};

const isSuggestionClone = (
  item: MeetingTopic | SuggestionClone,
): item is SuggestionClone => "temporaryKey" in item;

const cloneSuggestion = (topic: Topic): SuggestionClone => ({
  ...topic,
  temporaryKey: `suggestion-${topic.id}-${++temporaryKey}`,
});

const onAgendaChange = async (
  group: AgendaGroup,
  event: {
    added?: { element: SuggestionClone; newIndex: number };
    moved?: unknown;
  },
) => {
  if (pending.value) return;
  if (event.added && isSuggestionClone(event.added.element)) {
    const [temporary] = group.items.splice(event.added.newIndex, 1);
    if (!temporary) return;
    await withReload(() =>
      api.addMeetingTopic(id, {
        topicId: temporary.id,
        sectionId: group.section.id,
        position: event.added!.newIndex + 1,
      }),
    );
    return;
  }
  if (event.moved || event.added) await persistOrder();
};

const add = async (topic: Topic) => {
  const sectionId =
    selectedSections[topic.id] ||
    topic.defaultSectionId ||
    sections.value[0]?.id;
  if (!sectionId) return;
  await withReload(() =>
    api.addMeetingTopic(id, { topicId: topic.id, sectionId }),
  );
};

const remove = async (item: MeetingTopic) => {
  await withReload(() => api.removeMeetingTopic(id, item.id));
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
        await api.updateMeetingTopic(id, {
          ...item,
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
  await withReload(async () => {
    const topic = await api.createTopic(toTopicInput({
      ...form,
    }));
    const sectionId = form.defaultSectionId || sections.value[0]?.id;
    if (sectionId)
      await api.addMeetingTopic(id, { topicId: topic.id, sectionId });
  });
  newVisible.value = false;
};

onMounted(load);
</script>

<template>
  <section class="page">
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="meeting">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ t("meetingPreparation.eyebrow") }}</p>
          <h1>{{ meetingLabel(meeting) }}</h1>
          <p>{{ t("meetingPreparation.description") }}</p>
        </div>
        <RouterLink :to="`/meetings/${id}`">
          <Button
            icon="pi pi-arrow-right"
            icon-pos="right"
            :label="t('meetingPreparation.openAgenda')"
          />
        </RouterLink>
      </header>
      <div :class="['layout', { 'layout-read-only': readOnly }]">
        <main>
          <section
            v-for="group in grouped"
            :key="group.section.id"
            class="section"
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
            <Draggable
              :list="group.items"
              :group="agendaGroup"
              item-key="id"
              handle=".drag-handle"
              :disabled="pending || readOnly"
              class="agenda-drop-zone"
              ghost-class="drag-ghost"
              chosen-class="drag-chosen"
              @change="onAgendaChange(group, $event)"
            >
              <template #item="{ element: item }">
                <article>
                  <button
                    v-if="!readOnly"
                    class="drag-handle"
                    type="button"
                    :aria-label="t('meetingPreparation.drag')"
                    :title="t('meetingPreparation.drag')"
                  >
                    <span v-for="dot in 6" :key="dot" />
                  </button>
                  <div v-if="item.topic" class="topic-content">
                    <TopicTypeRenderer
                      :type="item.topic.type"
                      context="preparation"
                      :topic="item.topic"
                      :item="item"
                      :read-only="readOnly"
                      :users="responsibleUserOptions"
                      :save-field="saveMeetingTopicField(id, item)"
                      :save-note="saveMeetingTopicNote(id, item)"
                    />
                    <small>
                      {{ statusLabel(item.topic?.status) }}
                      <template v-if="item.topic?.followUpDate">
                        · {{ t("topics.followUp") }}
                        {{ formatDate(`${item.topic.followUpDate}T12:00:00`) }}
                      </template>
                    </small>
                  </div>
                  <div v-if="!readOnly" class="item-actions">
                    <div
                      v-if="topicUsesPlannedDuration(item.topic?.type ?? '')"
                      class="duration-control"
                    >
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
                      :aria-label="t('meetingPreparation.remove')"
                      icon="pi pi-times"
                      rounded
                      severity="danger"
                      text
                      @click="remove(item)"
                    />
                  </div>
                  <div
                    v-else-if="topicUsesPlannedDuration(item.topic?.type ?? '')"
                    class="topic-duration"
                  >
                    {{ item.plannedDuration ?? 0 }}
                    {{ t("common.minuteShort") }}
                  </div>
                </article>
              </template>
              <template #footer>
                <p v-if="!group.items.length" class="empty">
                  {{ t("meetingPreparation.noTopics") }}
                </p>
              </template>
            </Draggable>
          </section>
        </main>
        <aside v-if="!readOnly">
          <div class="suggestions-heading">
            <div>
              <h2>{{ t("meetingPreparation.addTopics") }}</h2>
              <p>{{ t("meetingPreparation.suggestions") }}</p>
            </div>
            <Button
              :aria-label="t('meetingPreparation.createTopic')"
              icon="pi pi-plus"
              rounded
              @click="newVisible = true"
            />
          </div>
          <Draggable
            :list="suggestions"
            :group="suggestionGroup"
            :clone="cloneSuggestion"
            item-key="id"
            handle=".drag-handle"
            :sort="false"
            :disabled="pending"
          >
            <template #item="{ element: topic }">
              <article class="suggestion">
                <div class="suggestion-title">
                  <button
                    class="drag-handle"
                    type="button"
                    :aria-label="t('meetingPreparation.drag')"
                    :title="t('meetingPreparation.drag')"
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
                </div>
                <Select
                  v-model="selectedSections[topic.id]"
                  :options="sections"
                  :placeholder="
                    topic.defaultSection?.name ||
                    t('meetingPreparation.chooseSection')
                  "
                  option-label="name"
                  option-value="id"
                />
                <Button
                  icon="pi pi-plus"
                  :label="t('meetingPreparation.addToAgenda')"
                  outlined
                  :disabled="pending"
                  @click="add(topic)"
                />
              </article>
            </template>
          </Draggable>
          <p v-if="!suggestions.length" class="empty">
            {{ t("meetingPreparation.allAdded") }}
          </p>
        </aside>
      </div>
    </template>
    <Dialog
      v-if="!readOnly"
      v-model:visible="newVisible"
      :style="{ width: '44rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="t('meetingPreparation.createAndAddTitle')"
      modal
    >
      <form id="new-topic" class="form" @submit.prevent="createAndAdd">
        <TopicTypeRadioGroup id="new-topic-type" v-model="form.type" />
        <div class="row">
          <label>
            <span>{{ t(topicNameTranslationKey(form.type)) }}</span>
            <InputText v-model="form.name" required />
          </label>
          <label>
            <span>{{ t("meetingPreparation.section") }}</span>
            <Select
              v-model="form.defaultSectionId"
              :options="sections"
              option-label="name"
              option-value="id"
              required
            />
          </label>
        </div>
        <label>
          <span>{{ t("topics.responsible") }}</span>
          <Select
            v-model="form.responsibleUserId"
            :options="responsibleUserOptions"
            option-label="firstName"
            option-value="id"
            show-clear
          >
            <template #option="{ option }">{{ formatUser(option) }}</template>
          </Select>
        </label>
        <TopicTypeRenderer
          :type="form.type"
          context="form"
          :model-value="form"
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
          :label="t('meetingPreparation.createAndAdd')"
          type="submit"
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
.section article:last-child {
  border: 0;
}
.topic-content {
  min-width: 0;
}
.item-actions {
  display: flex;
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
.drag-ghost {
  opacity: 0.35;
  background: #dbeafe;
}
.drag-chosen {
  box-shadow: 0 0 0 2px #93c5fd;
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
.layout aside {
  position: sticky;
  top: 1rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid #d8e0ec;
  border-radius: 0.75rem;
  background: #eef3fa;
}
.suggestion {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 0.7rem;
  padding: 0.8rem;
  border-radius: 0.6rem;
  background: #fff;
}
.suggestion-title {
  justify-content: flex-start;
  gap: 0.45rem;
}
.suggestion :deep(.p-select) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
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
