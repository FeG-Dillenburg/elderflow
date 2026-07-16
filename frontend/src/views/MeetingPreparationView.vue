<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Draggable from 'vuedraggable';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import RichTextEditor from '../components/RichTextEditor.vue';
import {
  api,
  meetingLabel,
  type AgendaSection,
  type Meeting,
  type MeetingTopic,
  type Topic,
  type TopicInput,
} from '../api/domain';

interface AgendaGroup {
  section: AgendaSection;
  items: MeetingTopic[];
}

interface SuggestionClone extends Topic {
  temporaryKey: string;
}

const route = useRoute();
const id = route.params.id as string;
const meeting = ref<Meeting | null>(null);
const sections = ref<AgendaSection[]>([]);
const suggestions = ref<Topic[]>([]);
const grouped = ref<AgendaGroup[]>([]);
const error = ref('');
const pending = ref(false);
const newVisible = ref(false);
const selectedSections = reactive<Record<string, string>>({});
const agendaGroup = { name: 'agenda-topics', pull: true, put: true };
const suggestionGroup = { name: 'agenda-topics', pull: 'clone', put: false };
let temporaryKey = 0;
const form = reactive({
  name: '',
  description: '',
  type: 'general',
  status: 'open',
  followUpDate: null,
  responsibleUserId: null,
  isRecurring: false,
  defaultSectionId: null as string | null,
  defaultPosition: null,
});

const initialiseGroups = () => {
  const orderedSections = [...sections.value].sort((left, right) => left.position - right.position);
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
    const [loadedMeeting, loadedSections, loadedSuggestions] = await Promise.all([
      api.meeting(id),
      api.sections(),
      api.meetingSuggestions(id),
    ]);
    meeting.value = loadedMeeting;
    sections.value = loadedSections;
    suggestions.value = loadedSuggestions;
    initialiseGroups();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load meeting preparation';
  }
};

const normalize = () => grouped.value.flatMap((group) => group.items.map((item, index) => ({
  id: item.id,
  sectionId: group.section.id,
  position: index + 1,
})));

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
  error.value = '';
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to save agenda';
  } finally {
    await load();
    pending.value = false;
  }
};

const persistOrder = async () => {
  applyNormalization();
  await withReload(() => api.reorderMeetingTopics(id, normalize()));
};

const isSuggestionClone = (item: MeetingTopic | SuggestionClone): item is SuggestionClone =>
  'temporaryKey' in item;

const cloneSuggestion = (topic: Topic): SuggestionClone => ({
  ...topic,
  temporaryKey: `suggestion-${topic.id}-${++temporaryKey}`,
});

const onAgendaChange = async (group: AgendaGroup, event: { added?: { element: SuggestionClone; newIndex: number }; moved?: unknown }) => {
  if (pending.value) return;
  if (event.added && isSuggestionClone(event.added.element)) {
    const [temporary] = group.items.splice(event.added.newIndex, 1);
    if (!temporary) return;
    await withReload(() => api.addMeetingTopic(id, {
      topicId: temporary.id,
      sectionId: group.section.id,
      position: event.added!.newIndex + 1,
    }));
    return;
  }
  if (event.moved || event.added) await persistOrder();
};

const add = async (topic: Topic) => {
  const sectionId = selectedSections[topic.id] || topic.defaultSectionId || sections.value[0]?.id;
  if (!sectionId) return;
  await withReload(() => api.addMeetingTopic(id, { topicId: topic.id, sectionId }));
};

const remove = async (item: MeetingTopic) => {
  await withReload(() => api.removeMeetingTopic(id, item.id));
};

const saveDuration = async (item: MeetingTopic, duration: number | null) => {
  item.plannedDuration = duration;
  await withReload(() => api.updateMeetingTopic(id, item));
};

const sectionDuration = (items: MeetingTopic[]) =>
  items.reduce((total, item) => total + (item.plannedDuration ?? 0), 0);

const createAndAdd = async () => {
  await withReload(async () => {
    const topic = await api.createTopic(form as TopicInput);
    const sectionId = form.defaultSectionId || sections.value[0]?.id;
    if (sectionId) await api.addMeetingTopic(id, { topicId: topic.id, sectionId });
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
          <p class="eyebrow">Meeting preparation</p>
          <h1>{{ meetingLabel(meeting) }}</h1>
          <p>Choose topics and adjust their section-specific order.</p>
        </div>
        <RouterLink :to="`/meetings/${id}`">
          <Button icon="pi pi-arrow-right" icon-pos="right" label="Open agenda" />
        </RouterLink>
      </header>
      <div class="layout">
        <main>
          <section v-for="group in grouped" :key="group.section.id" class="section">
            <h2>
              {{ group.section.name }}
              <span class="section-meta">
                <span>{{ sectionDuration(group.items) }} min.</span>
                <Tag :value="String(group.items.length)" severity="secondary" />
              </span>
            </h2>
            <Draggable
              :list="group.items"
              :group="agendaGroup"
              item-key="id"
              handle=".drag-handle"
              :disabled="pending"
              class="agenda-drop-zone"
              ghost-class="drag-ghost"
              chosen-class="drag-chosen"
              @change="onAgendaChange(group, $event)"
            >
              <template #item="{ element: item }">
                <article>
                  <button class="drag-handle" type="button" aria-label="Drag topic" title="Drag topic">
                    <span v-for="dot in 6" :key="dot" />
                  </button>
                  <div>
                    <strong>{{ item.topic?.name }}</strong>
                    <small>
                      {{ item.topic?.status }}
                      <template v-if="item.topic?.followUpDate"> · follow-up {{ item.topic.followUpDate }}</template>
                    </small>
                  </div>
                  <div>
                    <InputNumber
                      :model-value="item.plannedDuration"
                      aria-label="Planned duration in minutes"
                      :disabled="pending"
                      :min="1"
                      :step="5"
                      suffix=" min."
                      show-buttons
                      @update:model-value="saveDuration(item, $event)"
                    />
                    <Button :disabled="pending" aria-label="Remove" icon="pi pi-times" rounded severity="danger" text @click="remove(item)" />
                  </div>
                </article>
              </template>
              <template #footer>
                <p v-if="!group.items.length" class="empty">No topics yet.</p>
              </template>
            </Draggable>
          </section>
        </main>
        <aside>
          <div class="suggestions-heading">
            <div>
              <h2>Add topics</h2>
              <p>Open, due, and deferred topics.</p>
            </div>
            <Button aria-label="Create new topic" icon="pi pi-plus" rounded @click="newVisible = true" />
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
                  <button class="drag-handle" type="button" aria-label="Drag topic" title="Drag topic">
                    <span v-for="dot in 6" :key="dot" />
                  </button>
                  <div>
                    <strong>{{ topic.name }}</strong>
                    <small>{{ topic.type.replaceAll('_', ' ') }}<template v-if="topic.followUpDate"> · {{ topic.followUpDate }}</template></small>
                  </div>
                </div>
                <Select v-model="selectedSections[topic.id]" :options="sections" :placeholder="topic.defaultSection?.name || 'Choose section'" option-label="name" option-value="id" />
                <Button icon="pi pi-plus" label="Add to agenda" outlined :disabled="pending" @click="add(topic)" />
              </article>
            </template>
          </Draggable>
          <p v-if="!suggestions.length" class="empty">All active topics are already on the agenda.</p>
        </aside>
      </div>
    </template>
    <Dialog v-model:visible="newVisible" :style="{ width: '44rem', maxWidth: 'calc(100vw - 2rem)' }" header="Create and add topic" modal>
      <form id="new-topic" class="form" @submit.prevent="createAndAdd">
        <label><span>Name</span><InputText v-model="form.name" required /></label>
        <label><span>Description</span><RichTextEditor v-model="form.description" height="120px" /></label>
        <div class="row">
          <label><span>Type</span><Select v-model="form.type" :options="['general', 'urgent', 'strategic', 'person_related', 'prayer_pastoral_care', 'communication', 'appointment_date', 'book_chapter_input']" /></label>
          <label><span>Section</span><Select v-model="form.defaultSectionId" :options="sections" option-label="name" option-value="id" required /></label>
        </div>
      </form>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="newVisible = false" />
        <Button form="new-topic" label="Create and add" type="submit" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.page { max-width: 1300px; margin: 0 auto; }
.eyebrow { margin: 0 0 .3rem; color: #607dae; font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.page-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.page-header h1 { margin: 0; font-size: 2.2rem; letter-spacing: -.04em; }
.page-header p:last-child, .suggestions-heading p { margin: .45rem 0 0; color: #68758a; }
.layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, .8fr); gap: 1.25rem; align-items: start; }
.section { margin-bottom: 1rem; padding: 1rem; border: 1px solid #e1e6ed; border-radius: .75rem; background: #fff; }
.section h2, .suggestions-heading h2 { margin: 0; font-size: 1rem; }
.section h2 { display: flex; align-items: center; justify-content: space-between; padding-bottom: .65rem; border-bottom: 1px solid #e9edf2; }
.section-meta { display: flex; align-items: center; gap: .55rem; color: #718096; font-size: .8rem; font-weight: 600; }
.agenda-drop-zone { min-height: 3.25rem; }
.section article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .7rem; padding: .7rem 0; border-bottom: 1px solid #edf0f4; }
.section article:last-child { border: 0; }
.section article > :last-child { display: flex; align-items: center; gap: .25rem; }
.section article :deep(.p-inputnumber) { width: 8.25rem; }
.section small, .suggestion small { display: block; margin-top: .2rem; color: #718096; font-size: .75rem; }
.drag-handle { display: grid; grid-template-columns: repeat(2, 3px); gap: 3px; width: 20px; padding: 4px; border: 0; border-radius: 4px; background: transparent; cursor: grab; touch-action: none; }
.drag-handle:active { cursor: grabbing; }
.drag-handle:focus-visible { outline: 2px solid #3867c8; outline-offset: 2px; }
.drag-handle span { width: 3px; height: 3px; border-radius: 50%; background: #718096; }
.drag-ghost { opacity: .35; background: #dbeafe; }
.drag-chosen { box-shadow: 0 0 0 2px #93c5fd; }
.suggestions-heading, .suggestion-title { display: flex; align-items: center; justify-content: space-between; }
.suggestions-heading { margin-bottom: .8rem; }
.layout aside { position: sticky; top: 1rem; min-width: 0; padding: 1rem; border: 1px solid #d8e0ec; border-radius: .75rem; background: #eef3fa; }
.suggestion { display: grid; gap: .55rem; margin-bottom: .7rem; padding: .8rem; border-radius: .6rem; background: #fff; }
.suggestion-title { justify-content: flex-start; gap: .45rem; }
.suggestion :deep(.p-select) { width: 100%; min-width: 0; max-width: 100%; }
.empty { color: #8490a3; font-style: italic; }
.form, .form label { display: grid; gap: .45rem; }
.form { gap: 1rem; }
.form label > span { font-size: .86rem; font-weight: 650; }
.form :deep(input), .form :deep(.p-select) { width: 100%; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .layout aside { position: static; } }
@media (max-width: 650px) { .page-header { align-items: stretch; flex-direction: column; } .section article { grid-template-columns: auto minmax(0, 1fr) auto; } .row { grid-template-columns: 1fr; } }
</style>
