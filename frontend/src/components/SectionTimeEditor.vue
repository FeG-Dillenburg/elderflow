<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { MAX_SECTION_MINUTES, validSectionMinutes } from '../utils/agenda-timing';

const props = defineProps<{
  minutes: number;
  sectionName: string;
  disabled?: boolean;
  save: (minutes: number) => Promise<unknown>;
}>();
const { t } = useI18n();
const errorId = useId();
const editing = ref(false);
const draft = ref('');
const pending = ref(false);
const error = ref('');
const input = ref<HTMLInputElement>();
const open = async () => {
  if (props.disabled || pending.value) return;
  draft.value = String(props.minutes || '');
  error.value = '';
  editing.value = true;
  await nextTick();
  input.value?.focus();
};
const cancel = () => {
  if (pending.value) return;
  editing.value = false;
  error.value = '';
};
const save = async (retry = false) => {
  if (!editing.value || props.disabled || pending.value || (error.value && !retry)) return;
  const minutes = draft.value === '' ? 0 : Number(draft.value);
  if (input.value?.validity.badInput || (draft.value !== '' && !/^\d+$/.test(draft.value)) || !validSectionMinutes(minutes)) {
    error.value = t('agendaTiming.invalid');
    return;
  }
  if (minutes === props.minutes) {
    editing.value = false;
    return;
  }
  pending.value = true;
  error.value = '';
  try {
    await props.save(minutes);
    editing.value = false;
  } catch {
    error.value = t('agendaTiming.saveFailed');
  } finally {
    pending.value = false;
  }
};
const change = (event: Event) => {
  draft.value = (event.target as HTMLInputElement).value;
  error.value = '';
};
</script>

<template>
  <span class="section-time-editor" :aria-busy="pending">
    <button
      v-if="!editing"
      type="button"
      class="text-action"
      :disabled="disabled"
      :aria-label="t('agendaTiming.editFor', { name: sectionName })"
      @click="open"
    >
      {{ minutes ? t('agendaTiming.sectionTime', { minutes }) : t('agendaTiming.add') }}
    </button>
    <template v-else>
      <input
        ref="input"
        type="number"
        :value="draft"
        min="0"
        :max="MAX_SECTION_MINUTES"
        step="5"
        :disabled="pending || disabled"
        :aria-label="t('agendaTiming.editFor', { name: sectionName })"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? errorId : undefined"
        @input="change"
        @keydown.enter.prevent="save()"
        @keydown.esc.prevent.stop="cancel"
        @blur="save()"
      />
      <span v-if="pending" role="status">{{ t('agendaTiming.saving') }}</span>
      <span v-if="error" :id="errorId" class="save-error" role="alert">
        {{ error }}
        <button type="button" :disabled="disabled || pending" @click="save(true)">
          {{ t('agendaTiming.retry') }}
        </button>
      </span>
    </template>
  </span>
</template>

<style scoped>
.section-time-editor {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: normal;
}
.text-action {
  border: 0;
  background: transparent;
  color: var(--p-primary-color, #3864a0);
  font: inherit;
  padding: 0.3rem;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  cursor: pointer;
}
input {
  width: 5.5rem;
  padding: 0.3rem;
  font: inherit;
  border: 1px solid var(--p-inputtext-border-color, #bbb);
  border-radius: 0.3rem;
}
.save-error {
  color: var(--p-red-600, #b42318);
  font-size: 0.75rem;
}
</style>
