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

const props = defineProps<{ modelValue: TopicInput }>();
const emit = defineEmits<{ change: [patch: Partial<TopicInput>] }>();
const { t } = useI18n();
const signalOptions = computed(() => membershipStatusSignals.map((value) => ({
  value,
  label: t(`newMembershipTopic.signals.${value}`),
})));
const patch = <Key extends keyof TopicInput>(key: Key, value: TopicInput[Key]) =>
  emit("change", { [key]: value });

onMounted(() => {
  if (!props.modelValue.membershipStatusSignal) {
    emit("change", { membershipStatusSignal: "new" });
  }
});
</script>

<template>
  <div class="membership-form-fields">
    <label>
      <span>{{ t("newMembershipTopic.processStatus") }}</span>
      <InputText
        :model-value="modelValue.membershipProcessStatus"
        @update:model-value="patch('membershipProcessStatus', $event || null)"
      />
    </label>
    <label>
      <span>{{ t("newMembershipTopic.signal") }}</span>
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

.description {
  grid-column: 1 / -1;
}

.membership-form-fields :deep(input),
.membership-form-fields :deep(.p-select) {
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
