<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  value: string | null;
  label: string;
  multiline?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
  save: (value: string | null) => Promise<unknown>;
}>();
const { t } = useI18n();
const localValue = ref(props.value ?? "");
const persistedValue = ref(props.value ?? "");
const state = ref<"idle" | "saving" | "saved" | "error">("idle");
const error = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let queued: string | null | undefined;
let saving = false;

watch(() => props.value, (value) => {
  const next = value ?? "";
  if (localValue.value === persistedValue.value) localValue.value = next;
  persistedValue.value = next;
});

const drain = async () => {
  if (saving) return;
  while (queued !== undefined) {
    const value = queued;
    queued = undefined;
    if ((value ?? "") === persistedValue.value) continue;
    saving = true;
    state.value = "saving";
    error.value = "";
    try {
      await props.save(value);
      persistedValue.value = value ?? "";
      state.value = "saved";
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : t("newMembershipTopic.saveFailed");
      state.value = "error";
      queued = undefined;
      break;
    } finally {
      saving = false;
    }
  }
};
const save = () => {
  if (timer) clearTimeout(timer);
  queued = localValue.value.trim() ? localValue.value : null;
  void drain();
};
const schedule = () => {
  state.value = "idle";
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 600);
};
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <label
    class="inline-field"
    :class="{ 'inline-field-compact': compact }"
    :aria-busy="state === 'saving'"
  >
    <span v-if="!hideLabel">{{ label }}</span>
    <Textarea
      v-if="multiline"
      v-model="localValue"
      auto-resize
      rows="2"
      :aria-label="label"
      @input="schedule"
      @blur="save"
    />
    <InputText
      v-else
      v-model="localValue"
      :aria-label="label"
      @input="schedule"
      @blur="save"
    />
    <small v-if="!compact || state !== 'idle'" role="status" aria-live="polite">
      <template v-if="state === 'saving'">{{ t("newMembershipTopic.saving") }}</template>
      <template v-else-if="state === 'saved'">{{ t("newMembershipTopic.saved") }}</template>
      <template v-else-if="state === 'error'">
        {{ error }} <button type="button" @click="save">{{ t("newMembershipTopic.retry") }}</button>
      </template>
    </small>
  </label>
</template>

<style scoped>
.inline-field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.inline-field > span {
  color: #5f6b7c;
  font-size: 0.75rem;
  font-weight: 700;
}

.inline-field :deep(input),
.inline-field :deep(textarea) {
  width: 100%;
}

small {
  min-height: 1rem;
  color: #68758a;
  font-size: 0.7rem;
}

.inline-field-compact {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.inline-field-compact small {
  position: absolute;
  top: 100%;
  right: 0.5rem;
  z-index: 2;
  min-height: 0;
  padding: 0.1rem 0.25rem;
  border-radius: 0.2rem;
  background: #ffffff;
}

button {
  border: 0;
  padding: 0;
  color: #315c9b;
  background: transparent;
  text-decoration: underline;
  cursor: pointer;
}
</style>
