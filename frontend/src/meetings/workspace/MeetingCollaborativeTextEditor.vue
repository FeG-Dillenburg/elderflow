<script setup lang="ts">
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { generateJSON, getSchema } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { useEditor } from "@tiptap/vue-3";
import * as Y from "yjs";
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import RichTextEditor from "../../components/RichTextEditor.vue";
import RichTextEditorFrame from "../../components/RichTextEditorFrame.vue";
import CollaboratorAvatar from "../../components/CollaboratorAvatar.vue";
import { meetingRichTextExtensions } from "../../components/meeting-rich-text-extensions";
import { auth } from "../../auth/auth";
import { createCollaboratorPresentation } from "../../e2ee/collaborator-presentation";
import type { MeetingTextTarget } from "./core";
import { tryUseMeetingWorkspace } from "./vue";
import { meetingEditorBinding } from "./editor-binding";

const props = withDefaults(defineProps<{
  target: MeetingTextTarget;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  readonly?: boolean;
  height?: string;
  toolbar?: boolean;
  compact?: boolean;
  firstLineIndent?: string;
}>(), {
  readonly: false,
  height: "160px",
  toolbar: true,
  compact: false,
  firstLineIndent: "0px",
});
const model = defineModel<string>({ default: "" });
const emit = defineEmits<{ saved: []; error: [cause: unknown]; fallbackSave: [] }>();
const workspace = tryUseMeetingWorkspace();
const { t } = useI18n();
const collaborators = computed(() => workspace?.state.collaborators ?? []);
const workspaceReadOnly = computed(() => {
  if (!workspace) return false;
  if (!workspace.state.meeting) return true;
  try {
    return !workspace.text(props.target).editable;
  } catch { return true; }
});
const editorReadOnly = computed(() => props.readonly || workspaceReadOnly.value);
const binding = workspace ? meetingEditorBinding(workspace, props.target) : null;
const extensions = meetingRichTextExtensions(Boolean(binding));
const collaborator = computed(() => createCollaboratorPresentation(auth.state.user
  ? {
      id: auth.state.user.id,
      firstName: auth.state.user.firstName,
      lastName: auth.state.user.lastName,
    }
  : { id: "local", firstName: t("e2ee.collaborator"), lastName: "" }));

const renderCollaborationCaret = (liveCollaborator: Record<string, unknown>): HTMLElement => {
  const caret = window.document.createElement("span");
  const marker = window.document.createElement("span");
  const color = typeof liveCollaborator.color === "string"
    && /^#[0-9a-f]{6}$/i.test(liveCollaborator.color)
    ? liveCollaborator.color
    : "#315a9b";
  caret.classList.add("collaboration-carets__caret");
  caret.style.setProperty("--collaborator-color", color);
  marker.classList.add("collaboration-carets__marker");
  caret.append(marker);
  return caret;
};

if (binding && model.value
  && binding.provider.document.getXmlFragment(binding.field).length === 0) {
  const seed = new Y.Doc();
  prosemirrorJSONToYXmlFragment(
    getSchema(extensions),
    generateJSON(model.value, extensions),
    seed.getXmlFragment(binding.field),
  );
  Y.applyUpdateV2(binding.provider.document, Y.encodeStateAsUpdateV2(seed));
  seed.destroy();
}

const editor = binding ? useEditor({
  editable: !editorReadOnly.value,
  extensions: [
    ...extensions,
    Collaboration.configure({ document: binding.provider.document, field: binding.field }),
    CollaborationCaret.configure({
      provider: binding.provider,
      user: collaborator.value,
      render: renderCollaborationCaret,
    }),
  ],
  editorProps: { attributes: {
    "aria-label": props.ariaLabel ?? props.placeholder ?? "",
    ...(props.ariaDescription ? { "aria-description": props.ariaDescription } : {}),
  } },
  onUpdate: ({ editor: current }) => {
    model.value = current.getHTML();
  },
}) : null;

if (binding) binding.provider.awareness.setLocalStateField("user", collaborator.value);
watch(editorReadOnly, (readonly) => editor?.value?.setEditable(!readonly), { flush: "sync" });
watch(() => workspace?.state.meeting, (meeting) => {
  if (!meeting || ("appearanceId" in props.target
    && !meeting.agenda?.some((item) => item.id === (props.target as { appearanceId: string }).appearanceId))) {
    editor?.value?.destroy();
    model.value = "";
  }
}, { flush: "sync" });

const save = async () => {
  if (editorReadOnly.value) return;
  if (binding) {
    emit("saved");
    return;
  }
  if (!workspace) {
    emit("fallbackSave");
    return;
  }
  try {
    await workspace.updateText(props.target, model.value);
    emit("saved");
  } catch (cause) {
    emit("error", cause);
  }
};

onBeforeUnmount(() => editor?.value?.destroy());
</script>

<template>
  <RichTextEditor
    v-if="!binding"
    v-model="model"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :aria-description="ariaDescription"
    :readonly="editorReadOnly"
    :height="height"
    :toolbar="toolbar"
    :compact="compact"
    :first-line-indent="firstLineIndent"
    @blur="save"
  />
  <RichTextEditorFrame
    v-else
    :editor="editor"
    :placeholder="placeholder"
    :readonly="editorReadOnly"
    :toolbar="toolbar"
    :compact="compact"
    :height="height"
    :first-line-indent="firstLineIndent"
    @blur="save"
  >
    <template #toolbar-end>
      <div
        v-if="collaborators.length"
        class="live-collaborators"
        role="list"
        :aria-label="t('editor.liveCollaborators')"
      >
        <CollaboratorAvatar
          v-for="liveCollaborator in collaborators"
          :key="liveCollaborator.id"
          :collaborator="liveCollaborator"
        />
      </div>
    </template>
  </RichTextEditorFrame>
</template>

<style scoped>
.live-collaborators {
  display: flex;
  align-items: center;
  margin-left: auto;
}

:deep(.collaboration-carets__caret) {
  display: inline-block;
  position: relative;
  width: 0;
  height: 1.25em;
  margin-left: -1px;
  border-left: 2px solid var(--collaborator-color);
  vertical-align: text-bottom;
  pointer-events: none;
}

:deep(.collaboration-carets__marker) {
  position: absolute;
  bottom: -0.22rem;
  left: -0.25rem;
  width: 0;
  height: 0;
  border-bottom: 0.3rem solid var(--collaborator-color);
  border-right: 0.2rem solid transparent;
  border-left: 0.2rem solid transparent;
}
</style>
