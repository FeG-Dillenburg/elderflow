<script setup lang="ts">
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { generateJSON, getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import * as Y from "yjs";
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import type { StableMeetingFragment } from "../e2ee/meeting-document-codec";
import { meetingRichTextExtensions } from "./meeting-rich-text-extensions";

const props = withDefaults(defineProps<{
  placeholder?: string;
  height?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  readonly?: boolean;
  meetingId?: string;
  fragment?: StableMeetingFragment;
}>(), { height: "160px", readonly: false });
const model = defineModel<string>({ default: "" });
const emit = defineEmits<{ blur: [] }>();
const { t } = useI18n();
const resolvedPlaceholder = computed(() => props.placeholder ?? t("topicDetail.addUpdate"));
const liveProvider = props.meetingId ? meetingCollaboration.get(props.meetingId) : undefined;
const liveField = props.fragment ? `tiptap:${props.fragment}` : undefined;
const extensions = meetingRichTextExtensions(Boolean(liveProvider));

const deterministicClientId = (value: string): number => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  }
  return hash >>> 0 || 1;
};

if (liveProvider && liveField && model.value
  && liveProvider.document.getXmlFragment(liveField).length === 0) {
  const seed = new Y.Doc();
  (seed as { clientID: number }).clientID = deterministicClientId(
    `${liveProvider.meetingId}:${liveField}`,
  );
  prosemirrorJSONToYXmlFragment(
    getSchema(extensions),
    generateJSON(model.value, extensions),
    seed.getXmlFragment(liveField),
  );
  Y.applyUpdateV2(liveProvider.document, Y.encodeStateAsUpdateV2(seed));
  seed.destroy();
}

const editor = useEditor({
  content: liveProvider ? undefined : model.value,
  editable: !props.readonly,
  extensions: [
    ...extensions,
    ...(liveProvider && liveField ? [
      Collaboration.configure({ document: liveProvider.document, field: liveField }),
      CollaborationCaret.configure({
        provider: liveProvider,
        user: { name: t("e2ee.collaborator"), color: "#476fae" },
      }),
    ] : []),
  ],
  editorProps: { attributes: {
    "aria-label": props.ariaLabel ?? resolvedPlaceholder.value,
    ...(props.ariaDescription ? { "aria-description": props.ariaDescription } : {}),
  } },
  onUpdate: ({ editor: current }) => {
    model.value = current.getHTML();
  },
  onCreate: ({ editor: current }) => {
    model.value = current.getHTML();
  },
  onBlur: () => emit("blur"),
});

watch(model, (value) => {
  if (liveProvider) return;
  if (editor.value && editor.value.getHTML() !== value) {
    editor.value.commands.setContent(value, { emitUpdate: false });
  }
});
watch(() => props.readonly, (value) => editor.value?.setEditable(!value));

const setLink = () => {
  const previous = editor.value?.getAttributes("link").href as string | undefined;
  const href = window.prompt(t("editor.linkPrompt"), previous ?? "https://");
  if (href === null) return;
  if (!href.trim()) editor.value?.chain().focus().unsetLink().run();
  else editor.value?.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
};

onBeforeUnmount(() => editor.value?.destroy());
</script>

<template>
  <div class="rich-text-editor" :class="{ readonly: props.readonly }">
    <div v-if="!props.readonly" class="toolbar" role="toolbar" :aria-label="t('editor.toolbar')">
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
    </div>
    <EditorContent :editor="editor" :style="{ '--editor-height': props.height }" :data-placeholder="resolvedPlaceholder" />
  </div>
</template>

<style scoped>
.rich-text-editor {
  overflow: hidden;
  border: 1px solid #d6dce5;
  border-radius: 0.5rem;
  background: #fff;
}

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

.rich-text-editor :deep(.tiptap) {
  min-height: var(--editor-height);
  padding: 0.65rem 0.75rem;
  outline: 0;
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
