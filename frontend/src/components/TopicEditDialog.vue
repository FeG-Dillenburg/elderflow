<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import TopicTypeRadioGroup from "../topics/components/TopicTypeRadioGroup.vue";
import {
  api,
  formatUser,
  toLocalDate,
  type AgendaSection,
  type Topic,
  type TopicInput,
  type User,
} from "../api/domain";
import TopicTypeRenderer from "../topics/TopicTypeRenderer.vue";
import { creatableTopicTypes } from "../topics/topicTypeRegistry";
import { assignableUsers } from "../auth/roles";
import { useI18n } from "vue-i18n";
import { dateInputFormat } from "../i18n";
import { topicNameTranslationKey } from "../topics/topicTypes";
import { toTopicInput } from "../topics/types/new-membership/topicInput";

const props = withDefaults(defineProps<{
  topic: Topic;
  users: User[];
  sections: AgendaSection[];
  typeLocked?: boolean;
}>(), {
  typeLocked: false,
});
const emit = defineEmits<{ saved: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const formElement = ref<HTMLFormElement | null>(null);
const saving = ref(false);
const saveError = ref("");
const responsibleUserOptions = computed(() => assignableUsers(props.users));
const { t } = useI18n();
const form = reactive({
  name: "",
  description: null as string | null,
  type: "generic" as TopicInput["type"],
  status: "open",
  followUpDate: null as Date | null,
  responsibleUserId: null as string | null,
  membershipProcessStatus: null as string | null,
  membershipStatusSignal: null as TopicInput["membershipStatusSignal"],
  godparents: null as string | null,
  defaultSectionId: null as string | null,
  defaultPosition: null as number | null,
  recurrenceFirstDueDate: null as string | null,
  recurrenceInterval: null as number | null,
  recurrenceUnit: null as "weeks" | "months" | null,
});
const editableTopicTypes = computed(() =>
  [...new Set([props.topic.type, ...creatableTopicTypes()])],
);
const statuses = computed(() =>
  ["open", "done", "deferred", "archived"].map((value) => ({
    value,
    label: t(`labels.${value}`),
  })),
);

watch(
  () => props.topic,
  (topic) =>
    Object.assign(form, {
      name: topic.name,
      description: topic.description,
      type: topic.type,
      status: topic.status,
      followUpDate: topic.followUpDate
        ? new Date(`${topic.followUpDate}T12:00:00`)
        : null,
      responsibleUserId: topic.responsibleUserId,
      membershipProcessStatus: topic.membershipProcessStatus,
      membershipStatusSignal: topic.membershipStatusSignal,
      godparents: topic.godparents,
      defaultSectionId: topic.defaultSectionId,
      defaultPosition: topic.defaultPosition,
      recurrenceFirstDueDate: topic.recurrenceFirstDueDate ?? null,
      recurrenceInterval: topic.recurrenceInterval ?? null,
      recurrenceUnit: topic.recurrenceUnit ?? null,
    }),
  { immediate: true },
);

watch(visible, (isVisible) => {
  if (isVisible) saveError.value = "";
});

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const input = toTopicInput({
      ...form,
      followUpDate: toLocalDate(form.followUpDate),
    });
    await api.updateTopic(props.topic.id, input);
    visible.value = false;
    emit("saved");
  } catch (error) {
    saveError.value = error instanceof Error
      ? error.message
      : t("topicEdit.saveFailed");
  } finally {
    saving.value = false;
  }
}

function submitForm(): void {
  formElement.value?.requestSubmit();
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('topicEdit.title')"
    :style="{ width: '46rem', maxWidth: 'calc(100vw - 2rem)' }"
  >
    <Message v-if="saveError" severity="error" role="alert">
      {{ saveError }}
    </Message>
    <form ref="formElement" id="edit-topic" class="form" @submit.prevent="save">
      <TopicTypeRadioGroup
        id="edit-topic-type"
        v-model="form.type"
        :types="editableTopicTypes"
        :disabled="props.typeLocked"
        :aria-describedby="props.typeLocked ? 'edit-topic-type-lock-help' : undefined"
      />
      <small
        v-if="props.typeLocked"
        id="edit-topic-type-lock-help"
        class="field-help"
      >
        {{ t("topicEdit.typeLocked") }}
      </small>
      <div class="row">
        <label>
          <span>{{ t(topicNameTranslationKey(form.type)) }}</span>
          <InputText v-model="form.name" required />
        </label>
        <label>
          <span>{{ t("common.status") }}</span>
          <Select
            v-model="form.status"
            :options="statuses"
            option-label="label"
            option-value="value"
          />
        </label>
      </div>
      <TopicTypeRenderer
        :type="form.type"
        context="form"
        :model-value="form"
        @change="Object.assign(form, $event)"
      >
        <label v-if="form.type === 'recurring'">
          <span>{{ t("topicEdit.defaultSection") }}</span>
          <Select
            v-model="form.defaultSectionId"
            :options="sections"
            option-label="name"
            option-value="id"
            show-clear
            required
          />
        </label>
      </TopicTypeRenderer>
      <div class="row">
        <label>
          <span>{{ t("topicEdit.responsible") }}</span>
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
        <label v-if="form.type !== 'recurring'">
          <span>{{ t("topicEdit.followUpDate") }}</span>
          <DatePicker
            v-model="form.followUpDate"
            :date-format="dateInputFormat()"
            show-button-bar
          />
        </label>
      </div>
      <label v-if="form.type !== 'recurring'">
        <span>{{ t("topicEdit.defaultSection") }}</span>
        <Select
          v-model="form.defaultSectionId"
          :options="sections"
          option-label="name"
          option-value="id"
          show-clear
        />
      </label>
    </form>
    <template #footer>
      <Button
        :label="t('common.cancel')"
        :disabled="saving"
        severity="secondary"
        text
        @click="visible = false"
      />
      <Button
        :label="t('topicEdit.save')"
        :loading="saving"
        type="button"
        @click="submitForm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
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
.field-help {
  margin-top: -0.5rem;
  color: var(--p-text-muted-color);
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
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
