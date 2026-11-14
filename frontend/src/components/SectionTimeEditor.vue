<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import InputNumber, { type InputNumberInputEvent } from 'primevue/inputnumber';
import { useI18n } from 'vue-i18n';
import { MAX_SECTION_MINUTES, validSectionMinutes } from '../utils/agenda-timing';

const props = defineProps<{
  minutes: number;
  sectionName: string;
  disabled?: boolean;
  save: (minutes: number) => Promise<unknown>;
}>();
const { t, locale } = useI18n();
const errorId = useId();
const editing = ref(false);
const draft = ref('');
const pending = ref(false);
const error = ref('');
const normalizing = ref(false);
const host = ref<HTMLElement>();
const inputElement = () => host.value?.querySelector('input');
const controlValue = computed(() => {
  const value = Number(draft.value);
  return draft.value && Number.isFinite(value) ? value : null;
});
const suffix = computed(() => ` ${t('common.minuteShort')}`);
const restoreDraft = async () => {
  await nextTick();
  const input = inputElement();
  if (input) input.value = draft.value ? `${draft.value}${suffix.value}` : '';
};
const open = async () => {
  if (props.disabled || pending.value) return;
  draft.value = String(props.minutes || '');
  error.value = '';
  editing.value = true;
  await nextTick();
  inputElement()?.focus();
};
const cancel = () => {
  if (pending.value) return;
  editing.value = false;
  error.value = '';
};
const save = async (retry = false) => {
  if (!editing.value || props.disabled || pending.value || (error.value && !retry)) return;
  const minutes = draft.value === '' ? 0 : Number(draft.value);
  if (inputElement()?.validity.badInput || (draft.value !== '' && !/^\d+$/.test(draft.value)) || !validSectionMinutes(minutes)) {
    error.value = t('agendaTiming.invalid');
    void restoreDraft();
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
// Keep the draft before InputNumber normalizes or clamps on blur.
const captureInput = (event: Event) => {
  normalizing.value = false;
  const value = (event.target as HTMLInputElement).value;
  draft.value = value.endsWith(suffix.value) ? value.slice(0, -suffix.value.length) : value;
  error.value = '';
};
const change = (event: InputNumberInputEvent) => {
  normalizing.value = false;
  draft.value = event.value == null ? '' : String(event.value);
  error.value = '';
};
// PrimeVue also emits model-only changes for Home/End. Accept those, but
// keep normalization on Tab/blur from replacing an invalid draft before validation.
const captureKeydown = (event: KeyboardEvent) => {
  normalizing.value = event.key === 'Tab' || event.key === 'Enter';
};
const updateModel = (value: number | null) => {
  if (normalizing.value || pending.value || props.disabled) return;
  draft.value = value == null ? '' : String(value);
  error.value = '';
};
</script>

<template>
  <span
    ref="host"
    class="section-time-editor"
    :aria-busy="pending"
    @input.capture="captureInput"
  >
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
    <span v-else-if="pending" role="status">
      {{ t('agendaTiming.saving') }}
    </span>
    <template v-else>
      <InputNumber
        :model-value="controlValue"
        :locale="locale"
        :use-grouping="false"
        :min="0"
        :max="MAX_SECTION_MINUTES"
        :step="5"
        :suffix="suffix"
        show-buttons
        size="small"
        :disabled="disabled"
        :invalid="Boolean(error)"
        :aria-label="t('agendaTiming.editFor', { name: sectionName })"
        :pt="{ pcInputText: { 'aria-describedby': error ? errorId : undefined } }"
        @keydown.capture="captureKeydown"
        @keydown.enter.capture.prevent.stop="save()"
        @keydown.esc.capture.prevent.stop="cancel"
        @blur.capture="normalizing = true"
        @focus="normalizing = false"
        @update:model-value="updateModel"
        @input="change"
        @blur="save()"
      />
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
  --section-time-control-height: 1.875rem;
  min-height: var(--section-time-control-height);
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
.section-time-editor :deep(.p-inputnumber) {
  width: 5.75rem;
  height: var(--section-time-control-height);
  min-width: 0;
  --p-inputtext-sm-padding-y: 0.125rem;
  --p-inputnumber-button-width: 1.35rem;
}
.section-time-editor :deep(.p-inputnumber-input) {
  width: 0;
  height: 100%;
  min-width: 0;
}
.save-error {
  color: var(--p-red-600, #b42318);
  font-size: 0.75rem;
}
</style>
