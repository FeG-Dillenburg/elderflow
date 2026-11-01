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
  type TopicScalarRevisions,
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

let persistedForm: typeof form | null = null;
let draftTopicId: string | null = null;
let expectedRevisions: TopicScalarRevisions = {};

const syncTopicDraft = (topic: Topic, isVisible: boolean) => {
  if (draftTopicId !== topic.id) {
    persistedForm = null;
    expectedRevisions = {};
    draftTopicId = topic.id;
  }
  const next = {
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
  };
  for (const field of Object.keys(next) as Array<keyof typeof form>) {
    if (!isVisible || !persistedForm || JSON.stringify(form[field]) === JSON.stringify(persistedForm[field])) {
      Object.assign(form, { [field]: next[field] });
      if (field in (topic.scalarRevisions ?? {})) {
        const scalar = field as keyof TopicScalarRevisions;
        expectedRevisions[scalar] = topic.scalarRevisions?.[scalar];
      }
    }
  }
  persistedForm = next;
};
watch(
  () => [props.topic, visible.value] as const,
  ([topic, isVisible]) => syncTopicDraft(topic, isVisible),
  { immediate: true },
);

watch(visible, (isVisible) => {
  if (isVisible) saveError.value = "";
});

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  const topicId = props.topic.id;
  saveError.value = "";
  try {
    const input = toTopicInput({
      ...form,
      followUpDate: toLocalDate(form.followUpDate),
    });
    await api.updateTopic(topicId, { ...input, expectedRevisions: { ...expectedRevisions } });
    if (topicId !== props.topic.id) return;
    visible.value = false;
    emit("saved");
  } catch (error) {
    if ((error as { code?: string }).code === "TOPIC_FIELDS_CHANGED") {
      try {
        const latest = await api.topic(topicId);
        if (topicId !== props.topic.id) return;
        // Merge untouched values, then let a later explicit save adopt this baseline.
        syncTopicDraft(latest, visible.value);
        expectedRevisions = { ...latest.scalarRevisions };
      } catch {
        // Keep the original conflict and draft if the latest baseline is unavailable.
      }
    }
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
    :style="{
      width: '46rem',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: props.typeLocked ? 'calc(100dvh - 2rem)' : undefined,
    }"
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
