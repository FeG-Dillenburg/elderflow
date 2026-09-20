<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  MeetingCollaborativeTextEditor,
  type MeetingTextTarget,
} from "../../meetings/workspace";

const props = withDefaults(defineProps<{
  modelValue: string;
  label: string;
  description: string;
  state: "idle" | "saving" | "saved" | "error";
  error: string;
  target: MeetingTextTarget;
  height?: string;
  toolbar?: boolean;
  compact?: boolean;
  firstLineIndent?: string;
  showFeedback?: boolean;
}>(), {
  toolbar: true,
  showFeedback: true,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
}>();
const { t } = useI18n();
</script>

<template>
  <MeetingCollaborativeTextEditor
    :model-value="modelValue"
    :placeholder="label"
    :aria-label="label"
    :aria-description="description"
    :target="target"
    :height="height ?? '100px'"
    :toolbar="toolbar"
    :compact="compact"
    :first-line-indent="firstLineIndent"
    @update:model-value="emit('update:modelValue', $event)"
    @fallback-save="emit('save')"
  />
  <span
    v-if="showFeedback !== false && state !== 'error'"
    class="save-feedback"
    role="status"
    aria-live="polite"
  >
    <template v-if="state === 'saving'">
      {{ t("meetingTexts.saving") }}
    </template>
    <template v-else-if="state === 'saved'">
      {{ t("meetingTexts.saved") }}
    </template>
  </span>
  <span v-else-if="showFeedback !== false" class="save-feedback error" role="alert">
    {{ error }}
    <button type="button" @click="emit('save')">
      {{ t("meetingTexts.retry") }}
    </button>
  </span>
</template>

<style scoped>
.save-feedback {
  display: block;
  min-height: 1rem;
  color: #6c7b8f;
  font-size: 0.75rem;
}

.save-feedback.error {
  color: #b42318;
}

.save-feedback button {
  border: 0;
  padding: 0 0.2rem;
  color: inherit;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
