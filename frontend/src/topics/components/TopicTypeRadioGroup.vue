<script setup lang="ts">
import { computed } from "vue";
import RadioButton from "primevue/radiobutton";
import { useI18n } from "vue-i18n";
import { creatableTopicTypes } from "../topicTypeRegistry";
import type { TopicType } from "../topicTypes";

const props = defineProps<{
  id: string;
}>();
const model = defineModel<TopicType>({ required: true });
const { t } = useI18n();
const options = computed(() =>
  creatableTopicTypes().map((value) => ({
    value,
    label: t(`topicTypes.${value}`),
  })),
);
</script>

<template>
  <fieldset class="topic-type-selector">
    <legend>{{ t("topics.type") }}</legend>
    <div class="options">
      <label v-for="option in options" :key="option.value">
        <RadioButton
          v-model="model"
          :input-id="`${props.id}-${option.value}`"
          :name="props.id"
          :value="option.value"
        />
        <span>{{ option.label }}</span>
      </label>
    </div>
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

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.25rem;
}

.options label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}
</style>
