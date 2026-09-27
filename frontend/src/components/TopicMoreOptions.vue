<script setup lang="ts">
import { computed, ref, watch } from "vue";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import { useI18n } from "vue-i18n";
import { formatUser, type User } from "../api/domain";
import { assignableUsers } from "../auth/roles";

const props = defineProps<{
  responsibleUserId?: string | null;
  defaultPosition?: number | null;
  recurring: boolean;
  users: User[];
  active?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  change: [patch: { responsibleUserId?: string | null; defaultPosition?: number | null }];
}>();
const { t } = useI18n();
const disclosure = ref<HTMLDetailsElement | null>(null);
const userOptions = computed(() => assignableUsers(props.users));
const assignment = computed(() => formatUser(
  props.users.find((user) => user.id === props.responsibleUserId),
));
const position = computed(() => props.defaultPosition == null
  ? t("recurringTopic.append")
  : String(props.defaultPosition));

watch(() => props.active, () => {
  if (disclosure.value) disclosure.value.open = false;
});
watch(() => props.error, (error) => {
  if (error && disclosure.value) disclosure.value.open = true;
});
function revealInvalidField(): void {
  // Native constraint validation must be able to focus fields in the disclosure.
  if (disclosure.value) disclosure.value.open = true;
}
</script>

<template>
  <details ref="disclosure" class="more-options" @invalid.capture="revealInvalidField">
    <summary>
      <span>{{ t("topics.moreOptions") }}</span>
      <span class="options-summary">
        {{ t("topics.assignmentSummary", { user: assignment }) }}
        <template v-if="recurring">
          · {{ t("topics.positionSummary", { position }) }}
        </template>
      </span>
    </summary>
    <div class="options-fields">
      <label>
        <span>{{ t("topics.responsible") }}</span>
        <Select
          :model-value="responsibleUserId"
          :options="userOptions"
          :option-label="formatUser"
          option-value="id"
          :aria-label="t('topics.responsible')"
          :placeholder="t('common.unassigned')"
          show-clear
          @update:model-value="emit('change', { responsibleUserId: $event })"
        />
      </label>
      <label v-if="recurring">
        <span>{{ t("recurringTopic.defaultPosition") }}</span>
        <InputNumber
          :model-value="defaultPosition"
          :aria-label="t('recurringTopic.defaultPosition')"
          :min="1"
          :placeholder="t('recurringTopic.append')"
          show-buttons
          @update:model-value="emit('change', { defaultPosition: $event })"
        />
      </label>
    </div>
  </details>
</template>

<style scoped>
.more-options {
  min-width: 0;
  border-top: 1px solid var(--p-content-border-color);
  padding-top: 0.75rem;
}

summary {
  cursor: pointer;
  border-radius: var(--p-border-radius-sm);
}

summary:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 3px;
}

.options-summary {
  color: var(--p-text-muted-color);
  font-size: 0.86rem;
  margin-left: 0.5rem;
  overflow-wrap: anywhere;
}

.options-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  padding-top: 0.75rem;
}

label {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}

label > span {
  font-size: 0.86rem;
  font-weight: 650;
}

.options-fields :deep(.p-select),
.options-fields :deep(.p-inputnumber),
.options-fields :deep(input) {
  width: 100%;
  min-width: 0;
}

@media (max-width: 650px) {
  .options-fields {
    grid-template-columns: 1fr;
  }
}
</style>
