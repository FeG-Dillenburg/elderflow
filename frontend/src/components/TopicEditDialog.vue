<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import TopicFormFields from "./TopicFormFields.vue";
import {
  api,
  toLocalDate,
  type AgendaSection,
  type Topic,
  type TopicInput,
  type User,
} from "../api/domain";
import { creatableTopicTypes } from "../topics/topicTypeRegistry";
import { useI18n } from "vue-i18n";
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
      <TopicFormFields
        id="edit-topic"
        :model-value="form"
        :users="users"
        :sections="sections"
        :types="editableTopicTypes"
        :type-locked="props.typeLocked"
        :section-required="form.type === 'recurring'"
        :active="visible"
        :error="saveError"
        @change="Object.assign(form, $event)"
      >
        <label>
          <span>{{ t("common.status") }}</span>
          <Select
            v-model="form.status"
            :options="statuses"
            option-label="label"
            option-value="value"
            :aria-label="t('common.status')"
          />
        </label>
      </TopicFormFields>
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
.form {
  margin: 0;
}
</style>
