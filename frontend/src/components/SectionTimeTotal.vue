<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SectionTiming } from '../utils/agenda-timing';

const props = defineProps<{
  timing: SectionTiming;
}>();
const { t } = useI18n();
const formula = computed(() => t('agendaTiming.formula', {
  allowance: props.timing.allowance,
  topics: props.timing.topics,
}));
</script>

<template>
  <span
    class="section-time-total"
    tabindex="0"
    :title="formula"
    :aria-description="formula"
  >
    {{ props.timing.total }} {{ t('common.minuteShort') }}
  </span>
</template>

<style scoped>
.section-time-total {
  font-size: 0.8rem;
  font-weight: normal;
  cursor: help;
}
</style>
