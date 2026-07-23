<script setup lang="ts">
import Editor from "primevue/editor";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{ placeholder?: string; height?: string }>(),
  {
    height: "160px",
  },
);
const { t } = useI18n();
const emit = defineEmits<{ blur: [] }>();
const resolvedPlaceholder = computed(
  () => props.placeholder ?? t("topicDetail.addUpdate"),
);

const model = defineModel<string>({ default: "" });
const onSelectionChange = (event: { range: unknown | null }) => {
  if (event.range === null) emit("blur");
};
</script>

<template>
  <Editor
    v-model="model"
    :placeholder="resolvedPlaceholder"
    :editor-style="{ height: props.height }"
    @selection-change="onSelectionChange"
  >
    <template #toolbar>
      <span class="ql-formats">
        <button
          class="ql-bold"
          type="button"
          :aria-label="t('editor.bold')"
          :title="t('editor.bold')"
        />
        <button
          class="ql-italic"
          type="button"
          :aria-label="t('editor.italic')"
          :title="t('editor.italic')"
        />
        <button
          class="ql-underline"
          type="button"
          :aria-label="t('editor.underline')"
          :title="t('editor.underline')"
        />
      </span>
      <span class="ql-formats">
        <button
          class="ql-list"
          value="ordered"
          type="button"
          :aria-label="t('editor.orderedList')"
          :title="t('editor.orderedList')"
        />
        <button
          class="ql-list"
          value="bullet"
          type="button"
          :aria-label="t('editor.bulletList')"
          :title="t('editor.bulletList')"
        />
        <button
          class="ql-link"
          type="button"
          :aria-label="t('editor.link')"
          :title="t('editor.link')"
        />
      </span>
    </template>
  </Editor>
</template>
