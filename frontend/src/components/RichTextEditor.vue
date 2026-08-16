<script setup lang="ts">
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { generateJSON, getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import * as Y from "yjs";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { auth } from "../auth/auth";
import {
  createCollaboratorPresentation,
  isCollaboratorPresentation,
  type CollaboratorPresentation,
} from "../e2ee/collaborator-presentation";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import type { StableMeetingFragment } from "../e2ee/meeting-document-codec";
import CollaboratorAvatar from "./CollaboratorAvatar.vue";
import { meetingRichTextExtensions } from "./meeting-rich-text-extensions";

const props = withDefaults(defineProps<{
  placeholder?: string;
  height?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  readonly?: boolean;
  toolbar?: boolean;
  compact?: boolean;
  firstLineIndent?: string;
  meetingId?: string;
  fragment?: StableMeetingFragment;
}>(), {
  height: "160px",
  readonly: false,
  toolbar: true,
  compact: false,
  firstLineIndent: "0px",
});
const model = defineModel<string>({ default: "" });
const emit = defineEmits<{ blur: [] }>();
const { t } = useI18n();
const resolvedPlaceholder = computed(() => props.placeholder ?? t("topicDetail.addUpdate"));
const liveProvider = props.meetingId ? meetingCollaboration.get(props.meetingId) : undefined;
const liveField = props.fragment ? `tiptap:${props.fragment}` : undefined;
const extensions = meetingRichTextExtensions(Boolean(liveProvider));
const localCollaborator = computed<CollaboratorPresentation>(() => {
  const user = auth.state.user;
  return createCollaboratorPresentation(user
    ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      }
    : {
        id: liveProvider ? String(liveProvider.awareness.clientID) : "local",
        firstName: t("e2ee.collaborator"),
        lastName: "",
      });
});
const liveCollaborators = ref<CollaboratorPresentation[]>([]);

const refreshLiveCollaborators = () => {
  const collaborators = new Map<string, CollaboratorPresentation>();
  for (const state of liveProvider?.awareness.getStates().values() ?? []) {
    if (isCollaboratorPresentation(state.user)) {
      collaborators.set(state.user.id, state.user);
    }
  }
  liveCollaborators.value = [...collaborators.values()]
    .sort((left, right) => left.name.localeCompare(right.name));
};

const renderCollaborationCaret = (collaborator: Record<string, unknown>): HTMLElement => {
  const caret = window.document.createElement("span");
  const marker = window.document.createElement("span");
  const color = typeof collaborator.color === "string" && /^#[0-9a-f]{6}$/i.test(collaborator.color)
    ? collaborator.color
    : "#315a9b";
  caret.classList.add("collaboration-carets__caret");
  caret.style.setProperty("--collaborator-color", color);
  marker.classList.add("collaboration-carets__marker");
  caret.append(marker);
  return caret;
};

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
        user: localCollaborator.value,
        render: renderCollaborationCaret,
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

if (liveProvider) {
  watch(localCollaborator, (collaborator) => {
    liveProvider.awareness.setLocalStateField("user", collaborator);
  });
  liveProvider.awareness.on("change", refreshLiveCollaborators);
  refreshLiveCollaborators();
}

const setLink = () => {
  const previous = editor.value?.getAttributes("link").href as string | undefined;
  const href = window.prompt(t("editor.linkPrompt"), previous ?? "https://");
  if (href === null) return;
  if (!href.trim()) editor.value?.chain().focus().unsetLink().run();
  else editor.value?.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
};

onBeforeUnmount(() => {
  liveProvider?.awareness.off("change", refreshLiveCollaborators);
  editor.value?.destroy();
});
</script>

<template>
  <div
    class="rich-text-editor"
    :class="{ readonly: props.readonly, compact: props.compact }"
    :style="{
      '--editor-height': props.height,
      '--editor-first-line-indent': props.firstLineIndent,
    }"
  >
    <div
      v-if="!props.readonly && props.toolbar"
      class="toolbar"
      role="toolbar"
      :aria-label="t('editor.toolbar')"
    >
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
      <div
        v-if="liveCollaborators.length"
        class="live-collaborators"
        role="list"
        :aria-label="t('editor.liveCollaborators')"
      >
        <CollaboratorAvatar
          v-for="collaborator in liveCollaborators"
          :key="collaborator.id"
          :collaborator="collaborator"
        />
      </div>
    </div>
    <EditorContent :editor="editor" :data-placeholder="resolvedPlaceholder" />
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

.live-collaborators {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-left: 0.5rem;
}

.live-collaborators > * + * {
  margin-left: -0.35rem;
}

.rich-text-editor :deep(.tiptap) {
  min-height: var(--editor-height);
  padding: 0.65rem 0.75rem;
  outline: 0;
}

.rich-text-editor :deep(.tiptap > p:first-child) {
  text-indent: var(--editor-first-line-indent);
}

.rich-text-editor.compact :deep(.tiptap) {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
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

.rich-text-editor :deep(.collaboration-carets__caret) {
  display: inline-block;
  position: relative;
  width: 0;
  height: 1.25em;
  margin-left: -1px;
  border-left: 2px solid var(--collaborator-color);
  vertical-align: text-bottom;
  pointer-events: none;
}

.rich-text-editor :deep(.collaboration-carets__marker) {
  position: absolute;
  bottom: -0.22rem;
  left: -0.25rem;
  width: 0;
  height: 0;
  border-top: 0.3rem solid var(--collaborator-color);
  border-right: 0.2rem solid transparent;
  border-left: 0.2rem solid transparent;
}

.readonly {
  background: #f7f8fa;
}
</style>
