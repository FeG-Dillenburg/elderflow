<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import DatePicker from "primevue/datepicker";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import DOMPurify from "dompurify";
import RichTextEditor from "../components/RichTextEditor.vue";
import {
  api,
  formatUser,
  toLocalDate,
  type Task,
  type TaskInput,
  type TaskMeetingReference,
  type TaskTopicReference,
  type User,
} from "../api/domain";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import { useI18n } from "vue-i18n";
import { dateInputFormat, formatDate } from "../i18n";
import { protectedText } from "../e2ee/protected-text";

const canManage = computed(() => !auth.state.user || auth.canManage("tasks"));
const canEditProtected = computed(
  () => canManage.value && protectedText.state.status === "unlocked",
);
const { t } = useI18n();
const statusOptions = computed(() =>
  ["open", "in_progress", "done", "cancelled"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);

const tasks = ref<Task[]>([]),
  users = ref<User[]>([]),
  topics = ref<TaskTopicReference[]>([]),
  meetings = ref<TaskMeetingReference[]>([]),
  loading = ref(true),
  visible = ref(false),
  saving = ref(false),
  error = ref(""),
  search = ref(""),
  editingId = ref<string | null>(null);
const assigneeOptions = computed(() => assignableUsers(users.value));
const relatedMeetingLabel = (meeting: TaskMeetingReference) =>
  `${meeting.title} · ${formatDate(`${meeting.date}T12:00:00`)}`;
const relatedMeetingValueLabel = (id: string | null) => {
  const meeting = meetings.value.find((candidate) => candidate.id === id);
  return meeting ? relatedMeetingLabel(meeting) : t("common.none");
};
const visibleTasks = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  if (!needle) return tasks.value;
  return tasks.value.filter((task) =>
    [task.title, task.description ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(needle)),
  );
});
const filters = reactive({
  assignedToId: "",
  topicId: "",
  meetingId: "",
  status: "open",
  dueOn: null as Date | null,
  overdue: false,
});
const form = reactive({
  title: "",
  description: "",
  topicId: null as string | null,
  meetingId: null as string | null,
  assignedToId: null as string | null,
  dueDate: null as Date | null,
  status: "open",
});
const load = async () => {
  loading.value = true;
  try {
    const [loadedTasks, loadedUsers, references] =
      await Promise.all([
        api.tasks({
          assignedToId: filters.assignedToId,
          topicId: filters.topicId,
          meetingId: filters.meetingId,
          status: filters.status,
          dueOn: toLocalDate(filters.dueOn) ?? undefined,
          overdue: filters.overdue || undefined,
        }),
        api.userDirectory(),
        api.taskReferences(),
      ]);
    tasks.value = loadedTasks;
    users.value = loadedUsers;
    topics.value = references.topics;
    meetings.value = references.meetings;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("tasks.loadFailed");
  } finally {
    loading.value = false;
  }
};
const resetForm = () => {
  editingId.value = null;
  Object.assign(form, {
    title: "",
    description: "",
    topicId: null,
    meetingId: null,
    assignedToId: null,
    dueDate: null,
    status: "open",
  });
};
const openCreate = () => {
  resetForm();
  visible.value = true;
};
const edit = (task: Task) => {
  editingId.value = task.id;
  Object.assign(form, {
    title: task.title,
    description: task.description ?? "",
    topicId: task.topicId,
    meetingId: task.meetingId,
    assignedToId: task.assignedToId,
    dueDate: task.dueDate ? new Date(`${task.dueDate}T12:00:00`) : null,
    status: task.status,
  });
  visible.value = true;
};
const save = async () => {
  saving.value = true;
  try {
    const input: TaskInput = {
      title: form.title,
      description: form.description || null,
      topicId: form.topicId,
      meetingId: form.meetingId,
      assignedToId: form.assignedToId,
      dueDate: toLocalDate(form.dueDate),
      status: form.status,
    };
    if (editingId.value) await api.updateTask(editingId.value, input);
    else await api.createTask(input);
    visible.value = false;
    resetForm();
    await load();
  } catch (e) {
    error.value = e instanceof Error
      ? e.message
      : t(editingId.value ? "tasks.saveFailed" : "tasks.createFailed");
  } finally {
    saving.value = false;
  }
};
const complete = async (task: Task) => {
  await api.updateTask(task.id, {
    status: "done",
  });
  await load();
};
onMounted(load);
const safe = (html: string | null) => DOMPurify.sanitize(html ?? "");
</script>
<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t("tasks.eyebrow") }}</p>
        <h1>{{ t("tasks.title") }}</h1>
        <p>{{ t("tasks.description") }}</p>
      </div>
      <Button
        v-if="canManage"
        icon="pi pi-plus"
        :label="t('tasks.new')"
        :disabled="!canEditProtected"
        @click="openCreate"
      />
    </header>
    <Message
      v-if="canManage && !canEditProtected"
      severity="info"
    >
      {{ t("tasks.unlockToEdit") }}
    </Message>
    <div class="filters">
      <InputText
        v-model="search"
        :aria-label="t('tasks.searchAria')"
        :placeholder="t('tasks.search')"
      />
      <Select
        v-model="filters.assignedToId"
        :options="users"
        option-label="firstName"
        option-value="id"
        :placeholder="t('tasks.allAssignees')"
        show-clear
        @change="load"
      >
        <template #option="{ option }">{{ formatUser(option) }}</template>
      </Select>
      <Select
        v-model="filters.topicId"
        :options="topics"
        option-label="name"
        option-value="id"
        :placeholder="t('tasks.allTopics')"
        show-clear
        @change="load"
      />
      <Select
        v-model="filters.meetingId"
        :options="meetings"
        option-value="id"
        :placeholder="t('tasks.allMeetings')"
        show-clear
        @change="load"
      >
        <template #option="{ option }">{{ relatedMeetingLabel(option) }}</template>
      </Select>
      <Select
        v-model="filters.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        @change="load"
      />
      <DatePicker
        v-model="filters.dueOn"
        :date-format="dateInputFormat()"
        :placeholder="t('tasks.dueBy')"
        show-button-bar
        @value-change="load"
      />
      <Button
        :label="
          filters.overdue ? t('tasks.showingOverdue') : t('tasks.showOverdue')
        "
        :severity="filters.overdue ? 'danger' : 'secondary'"
        outlined
        @click="
          filters.overdue = !filters.overdue;
          load();
        "
      />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div class="table-card">
      <DataTable :loading="loading" :value="visibleTasks" data-key="id">
        <Column :header="t('common.task')">
          <template #body="{ data }">
            <strong>{{ data.title }}</strong>
            <div
              v-if="data.description"
              class="task-description"
              v-html="safe(data.description)"
            />
            <RouterLink
              v-if="data.topic"
              :to="`/topics/${data.topic.id}`"
              class="topic-link"
            >
              {{ data.topic.name }}
            </RouterLink>
            <RouterLink
              v-if="data.meeting"
              :to="`/meetings/${data.meeting.id}`"
              class="meeting-link"
            >
              {{ relatedMeetingLabel(data.meeting) }}
            </RouterLink>
          </template>
        </Column>
        <Column :header="t('tasks.assignedTo')">
          <template #body="{ data }">
            {{ formatUser(data.assignedTo) }}
          </template>
        </Column>
        <Column :header="t('tasks.dueDate')">
          <template #body="{ data }">
            {{
              data.dueDate
                ? formatDate(`${data.dueDate}T12:00:00`)
                : t("common.none")
            }}
          </template>
        </Column>
        <Column :header="t('common.status')">
          <template #body="{ data }">
            <Tag :value="t(`labels.${data.status}`)" severity="secondary" />
          </template>
        </Column>
        <Column>
          <template #body="{ data }">
            <Button
              v-if="canEditProtected"
              icon="pi pi-pencil"
              :aria-label="t('tasks.edit')"
              text
              @click="edit(data)"
            />
            <Button
              v-if="canManage && data.status !== 'done'"
              icon="pi pi-check"
              :label="t('tasks.done')"
              text
              @click="complete(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
    <Dialog
      v-if="canEditProtected"
      v-model:visible="visible"
      :style="{ width: '40rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="editingId ? t('tasks.editTitle') : t('tasks.createTitle')"
      modal
    >
      <form id="task-form" class="form" @submit.prevent="save">
        <label>
          <span>{{ t("tasks.titleField") }}</span>
          <InputText v-model="form.title" required />
        </label>
        <label>
          <span>{{ t("common.description") }}</span>
          <RichTextEditor v-model="form.description" height="110px" />
        </label>
        <label>
          <span>{{ t("common.topic") }}</span>
          <Select
            v-model="form.topicId"
            :options="topics"
            option-label="name"
            option-value="id"
            show-clear
          />
        </label>
        <label>
          <span>{{ t("common.meeting") }}</span>
          <Select
            v-model="form.meetingId"
            :options="meetings"
            option-value="id"
            show-clear
          >
            <template #option="{ option }">{{ relatedMeetingLabel(option) }}</template>
            <template #value="{ value }">
              {{
                relatedMeetingValueLabel(value)
              }}
            </template>
          </Select>
        </label>
        <div class="row">
          <label>
            <span>{{ t("tasks.assignedTo") }}</span>
            <Select
              v-model="form.assignedToId"
              :options="assigneeOptions"
              option-label="firstName"
              option-value="id"
              show-clear
            >
              <template #option="{ option }">{{ formatUser(option) }}</template>
            </Select>
          </label>
          <label>
            <span>{{ t("tasks.dueDate") }}</span>
            <DatePicker
              v-model="form.dueDate"
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
          @click="visible = false"
        />
        <Button
          :loading="saving"
          form="task-form"
          :label="editingId ? t('common.save') : t('tasks.create')"
          type="submit"
        />
      </template>
    </Dialog>
  </section>
</template>
<style scoped>
.page {
  max-width: 1250px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -0.04em;
}

.page-header p:last-child {
  margin: 0.45rem 0 0;
  color: #68758a;
}

.filters {
  display: flex;
  gap: 0.7rem;
  margin-bottom: 1rem;
}

.table-card {
  overflow: hidden;
  border: 1px solid #e2e6ec;
  border-radius: 0.8rem;
  background: #fff;
}

.topic-link,
.meeting-link {
  display: block;
  margin-top: 0.2rem;
  color: #607dae;
  font-size: 0.8rem;
  text-decoration: none;
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

@media (max-width: 650px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .row {
    grid-template-columns: 1fr;
  }
}
</style>
