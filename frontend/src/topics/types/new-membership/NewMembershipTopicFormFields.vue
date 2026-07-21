<script setup lang="ts">
import { computed, onMounted } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import RichTextEditor from "../../../components/RichTextEditor.vue";
import {
  membershipStatusSignals,
  type MembershipStatusSignal,
  type TopicInput,
} from "../../../api/domain";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  modelValue: TopicInput;
  initializeDefaults?: boolean;
}>();
const emit = defineEmits<{ change: [patch: Partial<TopicInput>] }>();
const { t } = useI18n();
const signalOptions = computed(() => membershipStatusSignals.map((value) => ({
  value,
  label: t(`newMembershipTopic.signals.${value}`),
})));
const patch = <Key extends keyof TopicInput>(key: Key, value: TopicInput[Key]) =>
  emit("change", { [key]: value });

onMounted(() => {
  if (!props.initializeDefaults) return;
  const defaults: Partial<TopicInput> = {};
  if (!props.modelValue.membershipProcessStatus) {
    defaults.membershipProcessStatus = t("newMembershipTopic.signals.new");
  }
  if (!props.modelValue.membershipStatusSignal) {
    defaults.membershipStatusSignal = "new";
  }
  if (Object.keys(defaults).length) emit("change", defaults);
});
</script>

<template>
  <div class="membership-form-fields">
    <label>
      <span>{{ t("newMembershipTopic.statusText") }}</span>
      <InputText
        :model-value="modelValue.membershipProcessStatus"
        @update:model-value="patch('membershipProcessStatus', $event || null)"
      />
    </label>
    <label>
      <span>{{ t("newMembershipTopic.statusColor") }}</span>
      <Select
        :model-value="modelValue.membershipStatusSignal ?? 'new'"
        :options="signalOptions"
        option-label="label"
        option-value="value"
        @update:model-value="patch('membershipStatusSignal', $event as MembershipStatusSignal)"
      />
    </label>
    <label>
      <span>{{ t("newMembershipTopic.godparents") }}</span>
      <InputText
        :model-value="modelValue.godparents"
        @update:model-value="patch('godparents', $event || null)"
      />
    </label>
    <div v-if="$slots.default" class="default-section-field">
      <slot />
    </div>
    <label class="description">
      <span>{{ t("newMembershipTopic.description") }}</span>
      <RichTextEditor
        :model-value="modelValue.description ?? ''"
        @update:model-value="patch('description', $event || null)"
      />
    </label>
  </div>
</template>

<style scoped>
.membership-form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

label {
  display: grid;
  gap: 0.45rem;
}

label > span {
  font-size: 0.86rem;
  font-weight: 650;
}

.default-section-field :deep(label) {
  display: grid;
  gap: 0.45rem;
}

.default-section-field :deep(label > span) {
  font-size: 0.86rem;
  font-weight: 650;
}

.description {
  grid-column: 1 / -1;
}

.membership-form-fields :deep(input),
.membership-form-fields :deep(.p-select),
.default-section-field :deep(.p-select) {
  width: 100%;
}

@media (max-width: 650px) {
  .membership-form-fields {
    grid-template-columns: 1fr;
  }

  .description {
    grid-column: auto;
  }
}
</style>
