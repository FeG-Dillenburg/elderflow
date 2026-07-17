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
import RichTextEditor from "../components/RichTextEditor.vue";
import {
  api,
  formatUser,
  meetingLabel,
  toLocalDate,
  type Meeting,
  type Task,
  type TaskInput,
  type Topic,
  type User,
} from "../api/domain";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import { useI18n } from "vue-i18n";
import { dateInputFormat, formatDate } from "../i18n";

const canManage = computed(() => !auth.state.user || auth.canManage("tasks"));
const { t } = useI18n();
const statusOptions = computed(() =>
  ["open", "in_progress", "done", "cancelled"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);

const tasks = ref<Task[]>([]),
  users = ref<User[]>([]),
  topics = ref<Topic[]>([]),
  meetings = ref<Meeting[]>([]),
  loading = ref(true),
  visible = ref(false),
  saving = ref(false),
  error = ref("");
const assigneeOptions = computed(() => assignableUsers(users.value));
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
  assignedToId: null as string | null,
  dueDate: null as Date | null,
  status: "open",
});
const load = async () => {
  loading.value = true;
  try {
    [tasks.value, users.value, topics.value, meetings.value] =
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
        api.topics({ status: "active" }),
        api.meetings(),
      ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("tasks.loadFailed");
  } finally {
    loading.value = false;
  }
};
const create = async () => {
  saving.value = true;
  try {
    const input: TaskInput = {
      title: form.title,
      description: form.description || null,
      topicId: form.topicId,
      meetingId: null,
      assignedToId: form.assignedToId,
      dueDate: toLocalDate(form.dueDate),
      status: "open",
    };
    await api.createTask(input);
    visible.value = false;
    Object.assign(form, {
      title: "",
      description: "",
      topicId: null,
      assignedToId: null,
      dueDate: null,
      status: "open",
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("tasks.createFailed");
  } finally {
    saving.value = false;
  }
};
const complete = async (task: Task) => {
  await api.updateTask(task.id, {
    title: task.title,
    description: task.description,
    topicId: task.topicId,
    meetingId: task.meetingId,
    assignedToId: task.assignedToId,
    dueDate: task.dueDate,
    status: "done",
  });
  await load();
};
onMounted(load);
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
        @click="visible = true"
      />
    </header>
    <div class="filters">
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
        <template #option="{ option }">{{ meetingLabel(option) }}</template>
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
      <DataTable :loading="loading" :value="tasks" data-key="id">
        <Column :header="t('common.task')">
          <template #body="{ data }">
            <strong>{{ data.title }}</strong>
            <RouterLink
              v-if="data.topic"
              :to="`/topics/${data.topic.id}`"
              class="topic-link"
            >
              {{ data.topic.name }}
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
              v-if="canManage"
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
      v-model:visible="visible"
      :style="{ width: '40rem', maxWidth: 'calc(100vw - 2rem)' }"
      :header="t('tasks.createTitle')"
      modal
    >
      <form id="task-form" class="form" @submit.prevent="create">
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
          :label="t('tasks.create')"
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

.topic-link {
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
