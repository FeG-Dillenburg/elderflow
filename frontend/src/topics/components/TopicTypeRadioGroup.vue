<script setup lang="ts">
import { computed } from "vue";
import SelectButton from "primevue/selectbutton";
import { useI18n } from "vue-i18n";
import { creatableTopicTypes } from "../topicTypeRegistry";
import type { TopicType } from "../topicTypes";

const props = defineProps<{
  id: string;
  types?: readonly TopicType[];
  disabled?: boolean;
}>();
const model = defineModel<TopicType>({ required: true });
const { t } = useI18n();
const options = computed(() =>
  (props.types ?? creatableTopicTypes()).map((value) => ({
    value,
    label: t(`topicTypes.${value}`),
  })),
);
</script>

<template>
  <fieldset
    class="topic-type-selector"
    :class="{ disabled: props.disabled }"
  >
    <legend>{{ t("topics.type") }}</legend>
    <SelectButton
      v-model="model"
      :id="props.id"
      :options="options"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :disabled="props.disabled"
      :aria-label="t('topics.type')"
      size="small"
    />
  </fieldset>
</template>

<style scoped>
.topic-type-selector {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.topic-type-selector legend {
  margin-bottom: 0.55rem;
  padding: 0;
  font-size: 0.86rem;
  font-weight: 650;
}

.topic-type-selector :deep(.p-selectbutton) {
  display: flex;
  flex-wrap: wrap;
}

.topic-type-selector :deep(.p-togglebutton) {
  flex: 1 1 auto;
}

.topic-type-selector :deep(.p-togglebutton-label) {
  white-space: normal;
}
</style>
