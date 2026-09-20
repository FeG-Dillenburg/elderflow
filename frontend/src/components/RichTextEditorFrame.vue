<script setup lang="ts">
import { EditorContent, type Editor } from "@tiptap/vue-3";
import RichTextToolbar from "./RichTextToolbar.vue";

withDefaults(defineProps<{
  editor?: Editor | null;
  placeholder?: string;
  readonly?: boolean;
  toolbar?: boolean;
  compact?: boolean;
  height?: string;
  firstLineIndent?: string;
}>(), {
  readonly: false,
  toolbar: true,
  compact: false,
  height: "160px",
  firstLineIndent: "0px",
});
defineEmits<{ blur: [] }>();
</script>

<template>
  <div
    class="rich-text-editor"
    :class="{ readonly, compact }"
    :style="{
      '--editor-height': height,
      '--editor-first-line-indent': firstLineIndent,
    }"
  >
    <RichTextToolbar v-if="!readonly && toolbar" :editor="editor">
      <slot name="toolbar-end" />
    </RichTextToolbar>
    <EditorContent
      :editor="editor ?? undefined"
      :data-placeholder="placeholder"
      @blur="$emit('blur')"
    />
  </div>
</template>

<style scoped>
.rich-text-editor {
  overflow: hidden;
  border: 1px solid #d6dce5;
  border-radius: 0.5rem;
  background: #fff;
}

.rich-text-editor :deep(.tiptap) {
  min-height: var(--editor-height);
  padding: 7px 0.75rem;
  outline: 0;
}

.rich-text-editor :deep(.tiptap > p),
.rich-text-editor :deep(.tiptap > ol),
.rich-text-editor :deep(.tiptap > ul),
.rich-text-editor :deep(.tiptap > blockquote) {
  margin-block: 0.5rem;
}

.rich-text-editor :deep(.tiptap > :first-child) {
  margin-top: 0;
}

.rich-text-editor :deep(.tiptap > :last-child) {
  margin-bottom: 0;
}

.rich-text-editor :deep(.tiptap li > p),
.rich-text-editor :deep(.tiptap blockquote > p) {
  margin-block: 0.25rem;
}

.rich-text-editor :deep(.tiptap > p:first-child) {
  text-indent: var(--editor-first-line-indent);
}

.rich-text-editor.compact :deep(.tiptap) {
  padding-top: 7px;
  padding-bottom: 7px;
}

.rich-text-editor.compact :deep(.tiptap > p) {
  margin: 0;
}

.rich-text-editor :deep(.tiptap:focus-visible) {
  box-shadow: inset 0 0 0 2px #476fae;
}

.rich-text-editor :deep(blockquote) {
  margin-left: 0;
  padding-left: 0.8rem;
  border-left: 3px solid #9aa9bd;
  color: #526176;
}

.rich-text-editor :deep(a) {
  color: #285caa;
  text-decoration: underline;
}

.readonly {
  background: #f7f8fa;
}
</style>
