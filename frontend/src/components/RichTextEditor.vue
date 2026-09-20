<script setup lang="ts">
import { useEditor } from "@tiptap/vue-3";
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { meetingRichTextExtensions } from "./meeting-rich-text-extensions";
import RichTextEditorFrame from "./RichTextEditorFrame.vue";

const props = withDefaults(defineProps<{
  placeholder?: string;
  height?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  readonly?: boolean;
  toolbar?: boolean;
  compact?: boolean;
  firstLineIndent?: string;
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
const resolvedPlaceholder = computed(() => props.placeholder ?? t("editor.placeholder"));
const extensions = meetingRichTextExtensions(false);

const editor = useEditor({
  content: model.value,
  editable: !props.readonly,
  extensions: [
    ...extensions,
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
  onFocus: ({ editor: current }) => {
    if (current.isEmpty) current.view.dispatch(current.state.tr.setStoredMarks([]));
  },
  onBlur: () => {
    emit("blur");
  },
});

watch(model, (value) => {
  if (editor.value && editor.value.getHTML() !== value) {
    editor.value.commands.setContent(value, { emitUpdate: false });
  }
});
watch(() => props.readonly, (value) => editor.value?.setEditable(!value));

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<template>
  <RichTextEditorFrame
    :editor="editor"
    :placeholder="resolvedPlaceholder"
    :readonly="props.readonly"
    :toolbar="props.toolbar"
    :compact="props.compact"
    :height="props.height"
    :first-line-indent="props.firstLineIndent"
  />
</template>
