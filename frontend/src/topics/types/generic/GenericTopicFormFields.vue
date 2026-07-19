<script setup lang="ts">
import { computed } from "vue";
import RichTextEditor from "../../../components/RichTextEditor.vue";
import type { TopicInput } from "../../../api/domain";
import { useI18n } from "vue-i18n";

const props = defineProps<{ modelValue: TopicInput }>();
const emit = defineEmits<{
  change: [patch: Pick<TopicInput, "description">];
}>();
const { t } = useI18n();
const description = computed({
  get: () => props.modelValue.description ?? "",
  set: (value: string) => emit("change", { description: value || null }),
});
</script>

<template>
  <label>
    <span>{{ t("topics.background") }}</span>
    <RichTextEditor v-model="description" />
  </label>
</template>

<style scoped>
label {
  display: grid;
  gap: 0.45rem;
}

label > span {
  font-size: 0.86rem;
  font-weight: 650;
}
</style>
