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
  if (!workspace?.state.meeting) return false;
  return !workspace.text(props.target).editable;
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
watch(editorReadOnly, (readonly) => editor?.value?.setEditable(!readonly));

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
</style>
