<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import { useI18n } from "vue-i18n";

const props = defineProps<{ editor?: Editor | null }>();
const { t } = useI18n();

const setLink = () => {
  const previous = props.editor?.getAttributes("link").href as string | undefined;
  const href = window.prompt(t("editor.linkPrompt"), previous ?? "https://");
  if (href === null) return;
  if (!href.trim()) props.editor?.chain().focus().unsetLink().run();
  else props.editor?.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
};
</script>

<template>
  <div class="toolbar" role="toolbar" :aria-label="t('editor.toolbar')">
    <button
      type="button"
      :aria-label="t('editor.bold')"
      :title="t('editor.bold')"
      @click="editor?.chain().focus().toggleBold().run()"
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      :aria-label="t('editor.italic')"
      :title="t('editor.italic')"
      @click="editor?.chain().focus().toggleItalic().run()"
    >
      <em>I</em>
    </button>
    <button
      type="button"
      :aria-label="t('editor.underline')"
      :title="t('editor.underline')"
      @click="editor?.chain().focus().toggleUnderline().run()"
    >
      <u>U</u>
    </button>
    <label :title="t('editor.textColor')">
      <span aria-hidden="true">A</span>
      <input
        type="color"
        value="#24344d"
        :aria-label="t('editor.textColor')"
        @input="editor?.chain().focus().setColor(($event.target as HTMLInputElement).value).run()"
      >
    </label>
    <label :title="t('editor.highlightColor')">
      <span aria-hidden="true">▰</span>
      <input
        type="color"
        value="#fff59d"
        :aria-label="t('editor.highlightColor')"
        @input="editor?.chain().focus().toggleHighlight({ color: ($event.target as HTMLInputElement).value }).run()"
      >
    </label>
    <button
      type="button"
      :aria-label="t('editor.blockquote')"
      :title="t('editor.blockquote')"
      @click="editor?.chain().focus().toggleBlockquote().run()"
    >
      ❝
    </button>
    <button
      type="button"
      :aria-label="t('editor.orderedList')"
      :title="t('editor.orderedList')"
      @click="editor?.chain().focus().toggleOrderedList().run()"
    >
      1.
    </button>
    <button
      type="button"
      :aria-label="t('editor.bulletList')"
      :title="t('editor.bulletList')"
      @click="editor?.chain().focus().toggleBulletList().run()"
    >
      •
    </button>
    <button
      type="button"
      :aria-label="t('editor.link')"
      :title="t('editor.link')"
      @click="setLink"
    >
      🔗
    </button>
    <slot />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  padding: 0.35rem;
  border-bottom: 1px solid #e4e8ee;
  background: #f8fafc;
}

.toolbar button,
.toolbar label {
  display: inline-grid;
  position: relative;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 0.3rem;
  color: #24344d;
  background: transparent;
  cursor: pointer;
}

.toolbar button:hover,
.toolbar button:focus-visible,
.toolbar label:hover {
  background: #e8eef8;
}

.toolbar input[type="color"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
