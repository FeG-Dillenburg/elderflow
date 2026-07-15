<script lang="ts" setup>
import {onMounted, reactive, ref} from 'vue';
import {RouterLink, useRoute} from 'vue-router';
import DOMPurify from 'dompurify';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import RichTextEditor from '../components/RichTextEditor.vue';
import TopicEditDialog from '../components/TopicEditDialog.vue';
import {
  api,
  formatUser,
  meetingLabel,
  toLocalDate,
  type AgendaSection,
  type MeetingTopic,
  type Task,
  type TaskInput,
  type Topic,
  type TopicUpdate,
  type User
} from '../api/domain';

const route = useRoute();
const id = route.params.id as string;
const topic = ref<Topic | null>(null), updates = ref<TopicUpdate[]>([]), tasks = ref<Task[]>([]),
    appearances = ref<MeetingTopic[]>([]), users = ref<User[]>([]), sections = ref<AgendaSection[]>([]),
    error = ref(''), updateText = ref(''), taskVisible = ref(false), editVisible = ref(false);
const task = reactive({title: '', description: '', assignedToId: null as string | null, dueDate: null as Date | null});
const load = async () => {
  try {
    [topic.value, updates.value, tasks.value, appearances.value, users.value, sections.value] = await Promise.all([api.topic(id), api.topicUpdates(id), api.tasks({
      topicId: id,
      status: 'open'
    }), api.topicAppearances(id), api.users(), api.sections()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load topic'
  }
};
const addUpdate = async () => {
  if (!updateText.value) return;
  await api.addTopicUpdate(id, {text: updateText.value, type: 'update'});
  updateText.value = '';
  await load()
};
const addTask = async () => {
  const input: TaskInput = {
    title: task.title,
    description: task.description || null,
    topicId: id,
    meetingId: null,
    assignedToId: task.assignedToId,
    dueDate: toLocalDate(task.dueDate),
    status: 'open'
  };
  await api.createTask(input);
  taskVisible.value = false;
  Object.assign(task, {title: '', description: '', assignedToId: null, dueDate: null});
  await load()
};
const safe = (html: string | null | undefined) => DOMPurify.sanitize(html ?? '').replace(/&nbsp;|&#160;|\u00a0/gi, ' ');
onMounted(load);
</script>
<template>
  <section class="page">
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="topic">
      <header class="topic-header">
        <div><p class="eyebrow">Topic history</p>
          <h1>{{ topic.name }}</h1>
          <p>
            <Tag :value="topic.status" severity="secondary"/>
            <span>{{ topic.type.replaceAll('_', ' ') }}</span></p>
        </div>
        <div>
          <Button icon="pi pi-pencil" label="Edit topic" text @click="editVisible=true"/>
          <Button icon="pi pi-plus" label="Add task" outlined @click="taskVisible=true"/>
        </div>
      </header>
      <div class="topic-grid">
        <main>
          <section class="background"><h2>Background</h2>
            <div v-html="safe(topic.description)"/>
          </section>
          <section>
            <div class="section-heading"><h2>Updates and minutes</h2><span>{{ updates.length }} entries</span></div>
            <div class="new-update">
              <RichTextEditor v-model="updateText" height="120px"/>
              <Button :disabled="!updateText" icon="pi pi-plus" label="Add update" @click="addUpdate"/>
            </div>
            <div class="feed">
              <article v-for="update in updates" :key="update.id">
                <div class="feed-mark"/>
                <div>
                  <div class="feed-meta">
                    <Tag :value="update.type" severity="secondary"/>
                    <span>{{ new Date(update.date).toLocaleString() }} · {{ formatUser(update.createdBy) }}</span>
                    <RouterLink v-if="update.meeting" :to="`/meetings/${update.meeting.id}`">
                      {{ meetingLabel(update.meeting) }}
                    </RouterLink>
                  </div>
                  <div class="rich" v-html="safe(update.text)"/>
                </div>
              </article>
              <p v-if="!updates.length" class="empty">No updates have been recorded.</p></div>
          </section>
        </main>
        <aside>
          <section><h2>Details</h2>
            <dl>
              <dt>Responsible</dt>
              <dd>{{ formatUser(topic.responsibleUser) }}</dd>
              <dt>Follow-up date</dt>
              <dd>{{ topic.followUpDate || 'Not set' }}</dd>
              <dt>Default section</dt>
              <dd>{{ topic.defaultSection?.name || 'Not set' }}</dd>
              <dt>Recurring</dt>
              <dd>{{ topic.isRecurring ? 'Yes' : 'No' }}</dd>
            </dl>
          </section>
          <section>
            <div class="aside-heading"><h2>Open tasks</h2>
              <Button aria-label="Add task" icon="pi pi-plus" rounded text @click="taskVisible=true"/>
            </div>
            <article v-for="item in tasks" :key="item.id" class="task">
              <strong>{{ item.title }}</strong><small>{{ formatUser(item.assignedTo) }}
              <template v-if="item.dueDate"> · {{ item.dueDate }}</template>
            </small></article>
            <p v-if="!tasks.length" class="empty">No open tasks.</p></section>
          <section><h2>Meeting history</h2>
            <RouterLink v-for="item in appearances" :key="item.id" :to="`/meetings/${item.meetingId}`"
                        class="appearance">
              {{ item.meeting ? meetingLabel(item.meeting) : 'Meeting' }}<small>{{ item.section?.name }}</small>
            </RouterLink>
            <p v-if="!appearances.length" class="empty">Not used in a meeting yet.</p></section>
        </aside>
      </div>
    </template>
    <TopicEditDialog v-if="topic" v-model:visible="editVisible" :sections="sections" :topic="topic" :users="users"
                     @saved="load"/>
    <Dialog v-model:visible="taskVisible" :style="{width:'38rem',maxWidth:'calc(100vw - 2rem)'}" header="Add follow-up task"
            modal>
      <form id="topic-task" class="form" @submit.prevent="addTask"><label><span>Title</span>
        <InputText v-model="task.title" required/>
      </label><label><span>Description</span>
        <RichTextEditor v-model="task.description" height="100px"/>
      </label>
        <div class="row"><label><span>Assigned to</span><Select v-model="task.assignedToId" :options="users"
                                                                option-label="firstName" option-value="id" show-clear>
          <template #option="{option}">{{ formatUser(option) }}</template>
        </Select></label><label><span>Due date</span>
          <DatePicker v-model="task.dueDate" date-format="yy-mm-dd" show-button-bar/>
        </label></div>
      </form>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="taskVisible=false"/>
        <Button form="topic-task" label="Create task" type="submit"/>
      </template>
    </Dialog>
  </section>
</template>
<style scoped>.page {
  max-width: 1200px;
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

.topic-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem
}

.topic-header h1 {
  margin: 0;
  font-size: 2.3rem;
  letter-spacing: -.04em
}

.topic-header p {
  display: flex;
  align-items: center;
  gap: .6rem;
  margin: .5rem 0 0;
  color: #68758a;
  text-transform: capitalize
}

.topic-grid {
  display: grid;
  grid-template-columns:minmax(0, 1.6fr) minmax(280px, .7fr);
  gap: 1.2rem;
  align-items: start
}

.topic-grid section, .topic-grid aside section {
  margin-bottom: 1rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid #e1e6ed;
  border-radius: .75rem;
  background: #fff
}

.topic-grid h2 {
  margin: 0 0 .8rem;
  font-size: 1rem
}

.background > div {
  min-width: 0;
  overflow-wrap: anywhere
}

.background :deep(p) {
  line-height: 1.55
}

.section-heading, .aside-heading {
  display: flex;
  align-items: center;
  justify-content: space-between
}

.section-heading span {
  color: #718096;
  font-size: .8rem
}

.new-update {
  display: grid;
  gap: .6rem;
  margin-bottom: 1.2rem
}

.new-update > button {
  justify-self: end
}

.feed article {
  display: grid;
  grid-template-columns:10px 1fr;
  gap: .7rem;
  padding-bottom: 1rem
}

.feed-mark {
  width: 8px;
  height: 8px;
  margin-top: .45rem;
  border-radius: 50%;
  background: #7895c6
}

.feed-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .5rem;
  margin-bottom: .4rem;
  color: #718096;
  font-size: .75rem
}

.feed-meta a {
  color: #536f9f
}

.rich :deep(p) {
  margin: .25rem 0
}

.topic-grid aside {
  position: sticky;
  top: 1rem
}

.topic-grid dl {
  display: grid;
  grid-template-columns:110px 1fr;
  gap: .65rem;
  margin: 0
}

.topic-grid dt {
  color: #718096;
  font-size: .8rem
}

.topic-grid dd {
  margin: 0;
  font-size: .85rem;
  font-weight: 650
}

.task, .appearance {
  display: block;
  padding: .65rem 0;
  border-bottom: 1px solid #edf0f4
}

.task small, .appearance small {
  display: block;
  margin-top: .2rem;
  color: #718096;
  font-size: .75rem
}

.appearance {
  text-decoration: none;
  font-weight: 650
}

.empty {
  color: #8490a3;
  font-size: .85rem;
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

.form :deep(input), .form :deep(.p-select), .form :deep(.p-datepicker) {
  width: 100%
}

.row {
  display: grid;
  grid-template-columns:1fr 1fr;
  gap: 1rem
}

@media (max-width: 850px) {
  .topic-grid {
    grid-template-columns:1fr
  }

  .topic-grid aside {
    position: static
  }
}

@media (max-width: 650px) {
  .topic-header {
    align-items: stretch;
    flex-direction: column
  }

  .row {
    grid-template-columns:1fr
  }
}</style>
