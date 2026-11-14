<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Meeting } from '../api/domain';
import { formatTime } from '../i18n';
import { meetingMinutes, plannedEnd } from '../utils/agenda-timing';

const props = defineProps<{ meeting: Meeting }>();
const { t } = useI18n();
const minutes = computed(() => meetingMinutes(props.meeting.agenda ?? [], props.meeting.sectionTimes));
const end = computed(() => plannedEnd(props.meeting.beginTime, minutes.value));
</script>

<template>
  <span class="planned-timing">
    {{ formatTime(meeting.beginTime) }}<template v-if="end">–{{ formatTime(end.time) }}
      <span v-if="end.days">
        {{ end.days === 1 ? t('agendaTiming.nextDay') : t('agendaTiming.daysLater', { days: end.days }) }}
      </span>
    </template>
    · {{ t('agendaTiming.planned', { minutes }) }}
  </span>
</template>

<style scoped>
.planned-timing {
  display: inline;
  overflow-wrap: anywhere;
}
</style>
