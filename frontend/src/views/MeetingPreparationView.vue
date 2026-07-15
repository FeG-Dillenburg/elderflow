<script lang="ts" setup>
import {computed, onMounted, reactive, ref} from 'vue';
import {RouterLink, useRoute} from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
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
  type TopicInput
} from '../api/domain';

const route = useRoute();
const id = route.params.id as string;
const meeting = ref<Meeting | null>(null), sections = ref<AgendaSection[]>([]), suggestions = ref<Topic[]>([]),
    error = ref(''), newVisible = ref(false);
const selectedSections = reactive<Record<string, string>>({});
const form = reactive({
  name: '',
  description: '',
  type: 'general',
  status: 'open',
  followUpDate: null,
  responsibleUserId: null,
  isRecurring: false,
  defaultSectionId: null as string | null,
  defaultPosition: null
});
const load = async () => {
  try {
    [meeting.value, sections.value, suggestions.value] = await Promise.all([api.meeting(id), api.sections(), api.meetingSuggestions(id)])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load meeting preparation'
  }
};
const grouped = computed(() => sections.value.map(section => ({
  section,
  items: (meeting.value?.agenda ?? []).filter(item => item.sectionId === section.id).sort((a, b) => a.position - b.position)
})));
const add = async (topic: Topic) => {
  const sectionId = selectedSections[topic.id] || topic.defaultSectionId || sections.value[0]?.id;
  if (!sectionId) return;
  await api.addMeetingTopic(id, {topicId: topic.id, sectionId});
  await load()
};
const remove = async (item: MeetingTopic) => {
  await api.removeMeetingTopic(id, item.id);
  await load()
};
const saveItem = async (item: MeetingTopic) => {
  await api.updateMeetingTopic(id, item);
  await load()
};
const move = async (items: MeetingTopic[], index: number, direction: -1 | 1) => {
  const other = items[index + direction];
  if (!other) return;
  const current = items[index], position = current.position;
  current.position = other.position;
  other.position = position;
  await Promise.all([api.updateMeetingTopic(id, current), api.updateMeetingTopic(id, other)]);
  await load()
};
const createAndAdd = async () => {
  const topic = await api.createTopic(form as TopicInput);
  const sectionId = form.defaultSectionId || sections.value[0]?.id;
  if (sectionId) await api.addMeetingTopic(id, {topicId: topic.id, sectionId});
  newVisible.value = false;
  await load()
};
onMounted(load);
</script>
<template>
  <section class="page">
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="meeting">
      <header class="page-header">
        <div><p class="eyebrow">Meeting preparation</p>
          <h1>{{ meetingLabel(meeting) }}</h1>
          <p>Choose topics and adjust their section-specific order.</p></div>
        <RouterLink :to="`/meetings/${id}`">
          <Button icon="pi pi-arrow-right" icon-pos="right" label="Open agenda"/>
        </RouterLink>
      </header>
      <div class="layout">
        <main>
          <section v-for="group in grouped" :key="group.section.id" class="section">
            <h2>{{ group.section.name }}
              <Tag :value="String(group.items.length)" severity="secondary"/>
            </h2>
            <p v-if="!group.items.length" class="empty">No topics yet.</p>
            <article v-for="(item,index) in group.items" :key="item.id">
              <div><strong>{{ item.topic?.name }}</strong><small>{{ item.topic?.status }}
                <template v-if="item.topic?.followUpDate"> · follow-up {{ item.topic.followUpDate }}</template>
              </small></div>
              <Select v-model="item.sectionId" :options="sections" aria-label="Agenda section" option-label="name"
                      option-value="id" @change="saveItem(item)"/>
              <div>
                <Button :disabled="index===0" aria-label="Move up" icon="pi pi-chevron-up" rounded text
                        @click="move(group.items,index,-1)"/>
                <Button :disabled="index===group.items.length-1" aria-label="Move down" icon="pi pi-chevron-down" rounded
                        text @click="move(group.items,index,1)"/>
                <Button aria-label="Remove" icon="pi pi-times" rounded severity="danger" text @click="remove(item)"/>
              </div>
            </article>
          </section>
        </main>
        <aside>
          <div class="suggestions-heading">
            <div><h2>Add topics</h2>
              <p>Open, due, and deferred topics.</p></div>
            <Button aria-label="Create new topic" icon="pi pi-plus" rounded @click="newVisible=true"/>
          </div>
          <article v-for="topic in suggestions" :key="topic.id" class="suggestion">
            <strong>{{ topic.name }}</strong><small>{{ topic.type.replaceAll('_', ' ') }}
            <template v-if="topic.followUpDate"> · {{ topic.followUpDate }}</template>
          </small><Select v-model="selectedSections[topic.id]" :options="sections" :placeholder="topic.defaultSection?.name||'Choose section'" option-label="name"
                          option-value="id"/>
            <Button icon="pi pi-plus" label="Add to agenda" outlined @click="add(topic)"/>
          </article>
          <p v-if="!suggestions.length" class="empty">All active topics are already on the agenda.</p></aside>
      </div>
    </template>
    <Dialog v-model:visible="newVisible" :style="{width:'44rem',maxWidth:'calc(100vw - 2rem)'}" header="Create and add topic"
            modal>
      <form id="new-topic" class="form" @submit.prevent="createAndAdd"><label><span>Name</span>
        <InputText v-model="form.name" required/>
      </label><label><span>Description</span>
        <RichTextEditor v-model="form.description" height="120px"/>
      </label>
        <div class="row"><label><span>Type</span><Select v-model="form.type"
                                                         :options="['general','urgent','strategic','person_related','prayer_pastoral_care','communication','appointment_date','book_chapter_input']"/></label><label><span>Section</span><Select
            v-model="form.defaultSectionId" :options="sections" option-label="name" option-value="id" required/></label>
        </div>
      </form>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="newVisible=false"/>
        <Button form="new-topic" label="Create and add" type="submit"/>
      </template>
    </Dialog>
  </section>
</template>
<style scoped>.page {
  max-width: 1300px;
  margin: 0 auto
}

.eyebrow {
  margin: 0 0 .3rem;
  color: #607dae;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase
}

.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem
}

.page-header h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -.04em
}

.page-header p:last-child {
  margin: .45rem 0 0;
  color: #68758a
}

.layout {
  display: grid;
  grid-template-columns:minmax(0, 1.6fr) minmax(300px, .8fr);
  gap: 1.25rem;
  align-items: start
}

.section {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #e1e6ed;
  border-radius: .75rem;
  background: #fff
}

.section h2, .suggestions-heading h2 {
  margin: 0;
  font-size: 1rem
}

.section h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: .65rem;
  border-bottom: 1px solid #e9edf2
}

.section article {
  display: grid;
  grid-template-columns:minmax(0, 1fr) 240px auto;
  align-items: center;
  gap: .7rem;
  padding: .7rem 0;
  border-bottom: 1px solid #edf0f4
}

.section article:last-child {
  border: 0
}

.section small, .suggestion small {
  display: block;
  margin-top: .2rem;
  color: #718096;
  font-size: .75rem
}

.suggestions-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .8rem
}

.suggestions-heading p {
  margin: .2rem 0 0;
  color: #718096;
  font-size: .8rem
}

.layout aside {
  position: sticky;
  top: 1rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid #d8e0ec;
  border-radius: .75rem;
  background: #eef3fa
}

.suggestion {
  display: grid;
  gap: .55rem;
  margin-bottom: .7rem;
  padding: .8rem;
  border-radius: .6rem;
  background: #fff
}

.suggestion :deep(.p-select) {
  width: 100%;
  min-width: 0;
  max-width: 100%
}

.empty {
  color: #8490a3;
  font-style: italic
}

.form, .form label {
  display: grid;
  gap: .45rem
}

.form {
  gap: 1rem
}

.form label > span {
  font-size: .86rem;
  font-weight: 650
}

.form :deep(input), .form :deep(.p-select) {
  width: 100%
}

.row {
  display: grid;
  grid-template-columns:1fr 1fr;
  gap: 1rem
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns:1fr
  }

  .layout aside {
    position: static
  }
}

@media (max-width: 650px) {
  .page-header {
    align-items: stretch;
    flex-direction: column
  }

  .section article {
    grid-template-columns:1fr
  }

  .row {
    grid-template-columns:1fr
  }
}</style>
