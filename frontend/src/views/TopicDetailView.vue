<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import DOMPurify from "dompurify";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import RichTextEditor from "../components/RichTextEditor.vue";
import TopicEditDialog from "../components/TopicEditDialog.vue";
import TopicTypeRenderer from "../topics/TopicTypeRenderer.vue";
import { topicTypeTranslationKey } from "../topics/topicTypes";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import {
  api,
  formatUser,
  meetingLabel,
  toLocalDate,
  type AgendaSection,
  type MeetingTopic,
  type SkippedRecurrence,
  type Task,
  type TaskInput,
  type Topic,
  type TopicUpdate,
  type User,
} from "../api/domain";
import { useI18n } from "vue-i18n";
import { dateInputFormat, formatDate } from "../i18n";

const canManage = computed(() => !auth.state.user || auth.canManage("topics"));
const { t } = useI18n();

const route = useRoute();
const id = route.params.id as string;
const topic = ref<Topic | null>(null),
  updates = ref<TopicUpdate[]>([]),
  tasks = ref<Task[]>([]),
  appearances = ref<MeetingTopic[]>([]),
  skippedRecurrences = ref<SkippedRecurrence[]>([]),
  users = ref<User[]>([]),
  sections = ref<AgendaSection[]>([]),
  error = ref(""),
  updateText = ref(""),
  taskVisible = ref(false),
  editVisible = ref(false);
const assigneeOptions = computed(() => assignableUsers(users.value));
const meetingTimestamp = (item: { date: string; beginTime?: string | null } | undefined) =>
  item ? new Date(`${item.date}T${item.beginTime ?? "00:00:00"}`).getTime() : 0;
const topicHistory = computed(() => [
  ...updates.value.map((item) => ({
    kind: "update" as const,
    timestamp: new Date(item.date).getTime(),
    item,
  })),
  ...appearances.value.map((item) => ({
    kind: "appearance" as const,
    timestamp: meetingTimestamp(item.meeting),
    item,
  })),
  ...skippedRecurrences.value.map((item) => ({
    kind: "skip" as const,
    timestamp: meetingTimestamp(item.meeting),
    item,
  })),
].sort((left, right) => right.timestamp - left.timestamp));
const task = reactive({
  title: "",
  description: "",
  assignedToId: null as string | null,
  dueDate: null as Date | null,
});
const load = async () => {
  try {
    [
      topic.value,
      updates.value,
      tasks.value,
      appearances.value,
      users.value,
      sections.value,
    ] = await Promise.all([
      api.topic(id),
      api.topicUpdates(id),
      api.tasks({
        topicId: id,
        status: "open",
      }),
      api.topicAppearances(id),
      api.userDirectory(),
      api.sections(),
    ]);
    skippedRecurrences.value = topic.value?.type === "recurring"
      ? await api.skippedRecurrences(id)
      : [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("topicDetail.loadFailed");
  }
};
const addUpdate = async () => {
  if (!updateText.value) return;
  await api.addTopicUpdate(id, { text: updateText.value, type: "update" });
  updateText.value = "";
  await load();
};
const addTask = async () => {
  const input: TaskInput = {
    title: task.title,
    description: task.description || null,
    topicId: id,
    meetingId: null,
    assignedToId: task.assignedToId,
    dueDate: toLocalDate(task.dueDate),
    status: "open",
  };
  await api.createTask(input);
  taskVisible.value = false;
  Object.assign(task, {
    title: "",
    description: "",
    assignedToId: null,
    dueDate: null,
  });
  await load();
};
const safe = (html: string | null | undefined) =>
  DOMPurify.sanitize(html ?? "").replace(/&nbsp;|&#160;|\u00a0/gi, " ");
const restore = async (skip: SkippedRecurrence) => {
  try {
    await api.restoreRecurrence(skip.meetingId, id);
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t("topicDetail.loadFailed");
  }
};
onMounted(load);
</script>
<template>
  <section class="page">
    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="topic">
      <header class="topic-header">
        <div>
          <p class="eyebrow">{{ t("topicDetail.eyebrow") }}</p>
          <h1>{{ topic.name }}</h1>
          <p>
            <Tag :value="t(`labels.${topic.status}`)" severity="secondary" />
            <span>{{ t(topicTypeTranslationKey(topic.type)) }}</span>
          </p>
        </div>
        <div v-if="canManage">
          <Button
            icon="pi pi-pencil"
            :label="t('topicDetail.edit')"
            text
            @click="editVisible = true"
          />
          <Button
            icon="pi pi-plus"
            :label="t('topicDetail.addTask')"
            outlined
            @click="taskVisible = true"
          />
        </div>
      </header>
      <div class="topic-grid">
        <main>
          <TopicTypeRenderer
            class="background"
            :type="topic.type"
            context="detail"
            :topic="topic"
          />
          <section>
            <div class="section-heading">
              <h2>{{ t("topicDetail.topicHistory") }}</h2>
              <span>
                {{ t("topicDetail.entries", { count: topicHistory.length }) }}
              </span>
            </div>
            <div v-if="canManage" class="new-update">
              <RichTextEditor v-model="updateText" height="120px" />
              <Button
                :disabled="!updateText"
                icon="pi pi-plus"
                :label="t('topicDetail.addUpdate')"
                @click="addUpdate"
              />
            </div>
            <div class="feed">
              <article
                v-for="entry in topicHistory"
                :key="`${entry.kind}-${entry.item.id}`"
              >
                <div class="feed-mark" />
                <div v-if="entry.kind === 'update'">
                  <div class="feed-meta">
                    <Tag
                      :value="t(`labels.${entry.item.type}`)"
                      severity="secondary"
                    />
                    <span>
                      {{
                        formatDate(entry.item.date, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      }}
                      · {{ formatUser(entry.item.createdBy) }}
                    </span>
                    <RouterLink
                      v-if="entry.item.meeting"
                      :to="`/meetings/${entry.item.meeting.id}`"
                    >
                      {{ meetingLabel(entry.item.meeting) }}
                    </RouterLink>
                  </div>
                  <div class="rich" v-html="safe(entry.item.text)" />
                </div>
                <RouterLink
                  v-else-if="entry.kind === 'appearance'"
                  :to="`/meetings/${entry.item.meetingId}`"
                  class="history-appearance"
                >
                  <span class="feed-meta">
                    <Tag :value="t('common.meeting')" severity="secondary" />
                    <span>
                      {{ entry.item.meeting
                        ? meetingLabel(entry.item.meeting)
                        : t("common.meeting") }}
                    </span>
                    <small>{{ entry.item.section?.name }}</small>
                  </span>
                  <span
                    v-if="entry.item.agendaNote"
                    class="appearance-note"
                    v-html="safe(entry.item.agendaNote)"
                  />
                </RouterLink>
                <div v-else class="history-skip">
                  <div class="feed-meta">
                    <Tag :value="t('recurringTopic.skipped')" severity="warn" />
                    <RouterLink :to="`/meetings/${entry.item.meetingId}`">
                      {{ entry.item.meeting
                        ? meetingLabel(entry.item.meeting)
                        : t("common.meeting") }}
                    </RouterLink>
                    <Button
                      v-if="canManage && entry.item.meeting?.status === 'planned'"
                      :label="t('recurringTopic.restore')"
                      size="small"
                      text
                      @click="restore(entry.item)"
                    />
                  </div>
                </div>
              </article>
              <p v-if="!topicHistory.length" class="empty">
                {{ t("topicDetail.noHistory") }}
              </p>
            </div>
          </section>
        </main>
        <aside>
          <section>
            <h2>{{ t("topicDetail.details") }}</h2>
            <dl>
              <dt>{{ t("topicDetail.responsible") }}</dt>
              <dd>{{ formatUser(topic.responsibleUser) }}</dd>
              <dt>{{ t("topicDetail.followUpDate") }}</dt>
              <dd>
                {{
                  topic.followUpDate
                    ? formatDate(`${topic.followUpDate}T12:00:00`)
                    : t("topicDetail.notSet")
                }}
              </dd>
              <dt>{{ t("topicDetail.defaultSection") }}</dt>
              <dd>
                {{ topic.defaultSection?.name || t("topicDetail.notSet") }}
              </dd>
              <dt>{{ t("topicDetail.recurring") }}</dt>
              <dd>
                {{ topic.type === "recurring" ? t("common.yes") : t("common.no") }}
              </dd>
            </dl>
          </section>
          <section>
            <div class="aside-heading">
              <h2>{{ t("topicDetail.openTasks") }}</h2>
              <Button
                v-if="canManage"
                :aria-label="t('topicDetail.addTask')"
                icon="pi pi-plus"
                rounded
                text
                @click="taskVisible = true"
              />
            </div>
            <article v-for="item in tasks" :key="item.id" class="task">
              <strong>{{ item.title }}</strong>
              <small>
                {{ formatUser(item.assignedTo) }}
                <template v-if="item.dueDate">
                  · {{ formatDate(`${item.dueDate}T12:00:00`) }}
                </template>
              </small>
            </article>
            <p v-if="!tasks.length" class="empty">
              {{ t("topicDetail.noTasks") }}
            </p>
          </section>
        </aside>
      </div>
    </template>
    <TopicEditDialog
      v-if="topic && canManage"
      v-model:visible="editVisible"
      :sections="sections"
      :topic="topic"
      :type-locked="appearances.length > 0"
      :users="users"
      @saved="load"
    />
    <Dialog
      v-if="canManage"
      v-model:visible="taskVisible"
      :style="{ width: '38rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="t('topicDetail.addFollowUpTask')"
      modal
    >
      <form id="topic-task" class="form" @submit.prevent="addTask">
        <label>
          <span>{{ t("tasks.titleField") }}</span>
          <InputText v-model="task.title" required />
        </label>
        <label>
          <span>{{ t("common.description") }}</span>
          <RichTextEditor v-model="task.description" height="100px" />
        </label>
        <div class="row">
          <label>
            <span>{{ t("topicDetail.assignedTo") }}</span>
            <Select
              v-model="task.assignedToId"
              :options="assigneeOptions"
              option-label="firstName"
              option-value="id"
              show-clear
            >
              <template #option="{ option }">{{ formatUser(option) }}</template>
            </Select>
          </label>
          <label>
            <span>{{ t("topicDetail.dueDate") }}</span>
            <DatePicker
              v-model="task.dueDate"
              :date-format="dateInputFormat()"
              show-button-bar
            />
          </label>
        </div>
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="taskVisible = false"
        />
        <Button
          form="topic-task"
          :label="t('topicDetail.createTask')"
          type="submit"
        />
      </template>
    </Dialog>
  </section>
</template>
<style scoped>
.page {
  max-width: 1200px;
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

.topic-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.topic-header h1 {
  margin: 0;
  font-size: 2.3rem;
  letter-spacing: -0.04em;
}

.topic-header p {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.5rem 0 0;
  color: #68758a;
  text-transform: capitalize;
}

.topic-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.7fr);
  gap: 1.2rem;
  align-items: start;
}

.topic-grid section,
.topic-grid aside section {
  margin-bottom: 1rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid #e1e6ed;
  border-radius: 0.75rem;
  background: #fff;
}

.topic-grid h2 {
  margin: 0 0 0.8rem;
  font-size: 1rem;
}

.section-heading,
.aside-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-heading span {
  color: #718096;
  font-size: 0.8rem;
}

.new-update {
  display: grid;
  gap: 0.6rem;
  margin-bottom: 1.2rem;
}

.new-update > button {
  justify-self: end;
}

.feed article {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 0.7rem;
  padding-bottom: 1rem;
}

.feed-mark {
  width: 8px;
  height: 8px;
  margin-top: 0.45rem;
  border-radius: 50%;
  background: #7895c6;
}

.feed-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  color: #718096;
  font-size: 0.75rem;
}

.feed-meta a {
  color: #536f9f;
}

.history-appearance {
  display: block;
  color: inherit;
  text-decoration: none;
}

.rich :deep(p) {
  margin: 0.25rem 0;
}

.topic-grid aside {
  position: sticky;
  top: 1rem;
}

.topic-grid dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0.65rem;
  margin: 0;
}

.topic-grid dt {
  color: #718096;
  font-size: 0.8rem;
}

.topic-grid dd {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 650;
}

.task,
.appearance {
  display: block;
  padding: 0.65rem 0;
  border-bottom: 1px solid #edf0f4;
}

.task small,
.appearance small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
  font-size: 0.75rem;
}

.appearance {
  text-decoration: none;
  font-weight: 650;
}

.appearance-note {
  display: block;
  margin-top: 0.35rem;
  color: #4a5568;
  font-weight: 400;
}

.appearance-note :deep(p) {
  margin: 0;
}

.empty {
  color: #8490a3;
  font-size: 0.85rem;
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
.form :deep(.p-select),
.form :deep(.p-datepicker) {
  width: 100%;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 850px) {
  .topic-grid {
    grid-template-columns: 1fr;
  }

  .topic-grid aside {
    position: static;
  }
}

@media (max-width: 650px) {
  .topic-header {
    align-items: stretch;
    flex-direction: column;
  }

  .row {
    grid-template-columns: 1fr;
  }
}
</style>
