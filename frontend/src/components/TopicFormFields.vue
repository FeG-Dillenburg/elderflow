<script setup lang="ts">
import { computed } from "vue";
import DatePicker from "primevue/datepicker";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { useI18n } from "vue-i18n";
import type { AgendaSection, TopicInput, User } from "../api/domain";
import { dateInputFormat } from "../i18n";
import TopicTypeRadioGroup from "../topics/components/TopicTypeRadioGroup.vue";
import TopicTypeRenderer from "../topics/TopicTypeRenderer.vue";
import { topicNameTranslationKey, type TopicType } from "../topics/topicTypes";
import TopicMoreOptions from "./TopicMoreOptions.vue";

type TopicFormDraft = {
  [Key in Exclude<keyof TopicInput, "followUpDate">]?: TopicInput[Key];
} & { name: string; type: TopicType; followUpDate: Date | null };

const props = defineProps<{
  id: string;
  modelValue: TopicFormDraft;
  users: User[];
  sections: AgendaSection[];
  types?: readonly TopicType[];
  typeLocked?: boolean;
  sectionRequired?: boolean;
  initializeDefaults?: boolean;
  active?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ change: [patch: Partial<TopicFormDraft>] }>();
const { t } = useI18n();
const hasFollowUp = computed(() =>
  props.modelValue.type !== "new_membership" && props.modelValue.type !== "recurring",
);
</script>

<template>
  <div class="topic-form-fields">
    <TopicTypeRadioGroup
      :id="`${id}-type`"
      :model-value="modelValue.type"
      :types="types"
      :disabled="typeLocked"
      :aria-describedby="typeLocked ? `${id}-type-lock-help` : undefined"
      @update:model-value="emit('change', { type: $event })"
    />
    <small v-if="typeLocked" :id="`${id}-type-lock-help`" class="field-help">
      {{ t("topicEdit.typeLocked") }}
    </small>
    <label>
      <span>{{ t(topicNameTranslationKey(modelValue.type)) }}</span>
      <InputText
        :model-value="modelValue.name"
        required
        @update:model-value="emit('change', { name: $event ?? '' })"
      />
    </label>
    <TopicTypeRenderer
      :type="modelValue.type"
      context="form"
      :model-value="modelValue"
      v-bind="modelValue.type === 'new_membership' ? { initializeDefaults } : {}"
      @change="emit('change', $event)"
    >
      <div :class="{ 'settings-row': hasFollowUp }">
        <label>
          <span>{{ t("topics.defaultSection") }}</span>
          <Select
            :model-value="modelValue.defaultSectionId"
            :options="sections"
            option-label="name"
            option-value="id"
            :aria-label="t('topics.defaultSection')"
            :required="sectionRequired"
            :show-clear="!sectionRequired"
            @update:model-value="emit('change', { defaultSectionId: $event })"
          />
        </label>
        <label v-if="hasFollowUp">
          <span>{{ t("topics.followUpDate") }}</span>
          <DatePicker
            :model-value="modelValue.followUpDate"
            :date-format="dateInputFormat()"
            show-button-bar
            @update:model-value="emit('change', { followUpDate: $event as Date | null })"
          />
        </label>
      </div>
    </TopicTypeRenderer>
    <slot />
    <TopicMoreOptions
      :responsible-user-id="modelValue.responsibleUserId"
      :default-position="modelValue.defaultPosition"
      :recurring="modelValue.type === 'recurring'"
      :users="users"
      :active="active"
      :error="error"
      @change="emit('change', $event)"
    />
  </div>
</template>

<style scoped>
.topic-form-fields,
.topic-form-fields :deep(label) {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}

.topic-form-fields {
  gap: 0.75rem;
}

.topic-form-fields :deep(label > span:first-child) {
  font-size: 0.86rem;
  font-weight: 650;
}

.field-help {
  color: var(--p-text-muted-color);
}

.topic-form-fields :deep(input),
.topic-form-fields :deep(.p-select),
.topic-form-fields :deep(.p-datepicker),
.topic-form-fields :deep(.p-inputnumber) {
  width: 100%;
  min-width: 0;
}

.topic-form-fields :deep(.p-select-label) {
  min-width: 0;
}

.topic-form-fields :deep(.tiptap) {
  max-height: 18rem;
  overflow-y: auto;
  overflow-wrap: anywhere;
}

.settings-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 650px) {
  .settings-row {
    grid-template-columns: 1fr;
  }
}
</style>
