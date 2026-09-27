<script setup lang="ts">
import { computed } from "vue";
import DatePicker from "primevue/datepicker";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import RichTextEditor from "../../../components/RichTextEditor.vue";
import { dateInputFormat } from "../../../i18n";
import { toLocalDate, type TopicInput } from "../../../api/domain";
import { useI18n } from "vue-i18n";

const props = defineProps<{ modelValue: TopicInput }>();
const emit = defineEmits<{ change: [patch: Partial<TopicInput>] }>();
const { t } = useI18n();
const dueDate = computed({
  get: () => props.modelValue.recurrenceFirstDueDate
    ? new Date(`${props.modelValue.recurrenceFirstDueDate}T12:00:00`)
    : null,
  set: (value: Date | null) => emit("change", { recurrenceFirstDueDate: toLocalDate(value) }),
});
const description = computed({
  get: () => props.modelValue.description ?? "",
  set: (value: string) => emit("change", { description: value || null }),
});
const units = computed(() => [
  { value: "weeks", label: t("recurringTopic.weeks") },
  { value: "months", label: t("recurringTopic.months") },
]);
</script>

<template>
  <div class="recurrence-fields">
    <label>
      <span>{{ t("recurringTopic.description") }}</span>
      <RichTextEditor
        v-model="description"
        height="120px"
        :placeholder="t('recurringTopic.description')"
      />
    </label>
    <div class="row">
      <slot />
      <label>
        <span>{{ t("recurringTopic.firstDueDate") }}</span>
        <DatePicker
          v-model="dueDate"
          :date-format="dateInputFormat()"
          required
          show-button-bar
        />
      </label>
    </div>
    <label>
      <span>{{ t("recurringTopic.interval") }}</span>
      <span class="interval">
        <InputNumber
          :model-value="modelValue.recurrenceInterval"
          :aria-label="t('recurringTopic.interval')"
          :min="1"
          required
          @update:model-value="emit('change', { recurrenceInterval: $event })"
        />
        <Select
          :model-value="modelValue.recurrenceUnit"
          :aria-label="t('recurringTopic.unit')"
          :options="units"
          option-label="label"
          option-value="value"
          required
          @update:model-value="emit('change', { recurrenceUnit: $event })"
        />
      </span>
    </label>
  </div>
</template>

<style scoped>
.recurrence-fields,
label {
  display: grid;
  gap: 0.45rem;
}

.recurrence-fields {
  gap: 0.75rem;
}

label > span:first-child {
  font-size: 0.86rem;
  font-weight: 650;
}

.row,
.interval {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
}

.interval {
  max-width: 22rem;
  gap: 0.5rem;
}

@media (max-width: 650px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
