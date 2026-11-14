<script setup lang="ts">
import { ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SectionTiming } from '../utils/agenda-timing';

const props = defineProps<{
  timing: SectionTiming;
}>();
const { t } = useI18n();
const expanded = ref(false);
const helpId = useId();
</script>

<template>
  <span class="section-time-total">
    <button
      type="button"
      :aria-expanded="expanded"
      :aria-controls="helpId"
      :aria-label="t('agendaTiming.totalHelp', { minutes: props.timing.total })"
      @click="expanded = !expanded"
    >
      {{ props.timing.total }} {{ t('common.minuteShort') }}
      <i class="pi pi-info-circle" aria-hidden="true" />
    </button>
    <span v-if="expanded" :id="helpId" class="formula" role="status">
      {{ t('agendaTiming.formula', { allowance: props.timing.allowance, topics: props.timing.topics }) }}
    </span>
  </span>
</template>

<style scoped>
.section-time-total {
  position: relative;
  font-size: 0.8rem;
  font-weight: normal;
}
button {
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  padding: 0.3rem;
  cursor: pointer;
}
.formula {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 5;
  width: max-content;
  max-width: min(20rem, 75vw);
  padding: 0.6rem;
  background: var(--p-content-background, white);
  border: 1px solid var(--p-content-border-color, #ddd);
  border-radius: 0.4rem;
  box-shadow: 0 0.2rem 0.6rem #0002;
}
</style>
