<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
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
  toLocalDate,
  type AgendaSection,
  type Topic,
  type TopicInput,
  type User,
} from "../api/domain";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import { useI18n } from "vue-i18n";
import { dateInputFormat, formatDate } from "../i18n";

const canManage = computed(() => !auth.state.user || auth.canManage("topics"));
const { t } = useI18n();
const topicTypeValues = [
  "recurring_agenda",
  "person_related",
  "prayer_pastoral_care",
  "urgent",
  "strategic",
  "communication",
  "appointment_date",
  "book_chapter_input",
  "general",
];
const topicTypes = computed(() =>
  topicTypeValues.map((value) => ({ value, label: t(`topicTypes.${value}`) })),
);
const statusOptions = computed(() => [
  { label: t("topics.openDeferred"), value: "active" },
  { label: t("labels.open"), value: "open" },
  { label: t("topics.deferred"), value: "deferred" },
  { label: t("labels.done"), value: "done" },
  { label: t("topics.archived"), value: "archived" },
]);
const topics = ref<Topic[]>([]),
  users = ref<User[]>([]),
  sections = ref<AgendaSection[]>([]),
  loading = ref(true),
  visible = ref(false),
  saving = ref(false),
  error = ref("");
const responsibleUserOptions = computed(() => assignableUsers(users.value));
const filters = reactive({
  status: "active",
  type: "",
  responsibleUserId: "",
  defaultSectionId: "",
  dueOn: null as Date | null,
});
const empty = () => ({
  name: "",
  description: "",
  type: "general",
  status: "open",
  followUpDate: null as Date | null,
  responsibleUserId: null as string | null,
  isRecurring: false,
  defaultSectionId: null as string | null,
  defaultPosition: null as number | null,
});
const form = reactive(empty());
const load = async () => {
  loading.value = true;
  try {
    [topics.value, users.value, sections.value] = await Promise.all([
      api.topics({
        status: filters.status,
        type: filters.type,
        responsibleUserId: filters.responsibleUserId,
        defaultSectionId: filters.defaultSectionId,
        dueOn: toLocalDate(filters.dueOn) ?? undefined,
      }),
      api.userDirectory(),
      api.sections(),
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("topics.loadFailed");
  } finally {
    loading.value = false;
  }
};
const open = () => {
  Object.assign(form, empty());
  visible.value = true;
};
const create = async () => {
  saving.value = true;
  try {
    const input: TopicInput = {
      ...form,
      followUpDate: toLocalDate(form.followUpDate),
    };
    await api.createTopic(input);
    visible.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("topics.createFailed");
  } finally {
    saving.value = false;
  }
};
onMounted(load);
</script>
<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t("topics.eyebrow") }}</p>
        <h1>{{ t("topics.title") }}</h1>
        <p>{{ t("topics.description") }}</p>
      </div>
      <Button
        v-if="canManage"
        :label="t('topics.new')"
        icon="pi pi-plus"
        @click="open"
      />
    </header>
    <div class="filters">
      <Select
        v-model="filters.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        @change="load"
      />
      <Select
        v-model="filters.type"
        :options="topicTypes"
        option-label="label"
        option-value="value"
        show-clear
        :placeholder="t('topics.allTypes')"
        @change="load"
      />
      <Select
        v-model="filters.defaultSectionId"
        :options="sections"
        option-label="name"
        option-value="id"
        show-clear
        :placeholder="t('topics.allSections')"
        @change="load"
      />
      <Select
        v-model="filters.responsibleUserId"
        :options="users"
        option-label="firstName"
        option-value="id"
        show-clear
        :placeholder="t('topics.allResponsible')"
        @change="load"
      >
        <template #option="{ option }">{{ formatUser(option) }}</template>
      </Select>
      <DatePicker
        v-model="filters.dueOn"
        :date-format="dateInputFormat()"
        show-button-bar
        :placeholder="t('topics.followUpDueBy')"
        @value-change="load"
      />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div class="table-card">
      <DataTable :value="topics" :loading="loading" data-key="id">
        <Column :header="t('common.topic')">
          <template #body="{ data }">
            <RouterLink class="primary-link" :to="`/topics/${data.id}`">
              {{ data.name }}
            </RouterLink>
            <small>
              {{ data.defaultSection?.name || t("topics.noDefaultSection") }}
            </small>
          </template>
        </Column>
        <Column :header="t('topics.type')">
          <template #body="{ data }">
            {{ topicTypes.find((t) => t.value === data.type)?.label }}
          </template>
        </Column>
        <Column :header="t('common.status')">
          <template #body="{ data }">
            <Tag :value="t(`labels.${data.status}`)" severity="secondary" />
          </template>
        </Column>
        <Column :header="t('topics.responsible')">
          <template #body="{ data }">
            {{ formatUser(data.responsibleUser) }}
          </template>
        </Column>
        <Column :header="t('topics.followUp')">
          <template #body="{ data }">
            {{
              data.followUpDate
                ? formatDate(`${data.followUpDate}T12:00:00`)
                : t("common.none")
            }}
          </template>
        </Column>
      </DataTable>
    </div>
    <Dialog
      v-model:visible="visible"
      modal
      :header="t('topics.createTitle')"
      :style="{ width: '46rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <form id="topic-form" class="form" @submit.prevent="create">
        <label>
          <span>{{ t("common.name") }}</span>
          <InputText v-model="form.name" required />
        </label>
        <label>
          <span>{{ t("topics.background") }}</span>
          <RichTextEditor v-model="form.description" />
        </label>
        <div class="row">
          <label>
            <span>{{ t("topics.type") }}</span>
            <Select
              v-model="form.type"
              :options="topicTypes"
              option-label="label"
              option-value="value"
            />
          </label>
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
        </div>
        <div class="row">
          <label>
            <span>{{ t("topics.followUpDate") }}</span>
            <DatePicker
              v-model="form.followUpDate"
              :date-format="dateInputFormat()"
              show-button-bar
            />
          </label>
          <label>
            <span>{{ t("topics.defaultSection") }}</span>
            <Select
              v-model="form.defaultSectionId"
              :options="sections"
              option-label="name"
              option-value="id"
              show-clear
            />
          </label>
        </div>
        <label class="checkbox">
          <Checkbox v-model="form.isRecurring" binary />
          <span>{{ t("topics.autoAdd") }}</span>
        </label>
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="visible = false"
        />
        <Button
          :label="t('topics.create')"
          type="submit"
          form="topic-form"
          :loading="saving"
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

.primary-link {
  display: block;
  font-weight: 700;
  text-decoration: none;
}

.primary-link + small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
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

.form .checkbox {
  display: flex;
  grid-template-columns: auto 1fr;
  align-items: center;
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
