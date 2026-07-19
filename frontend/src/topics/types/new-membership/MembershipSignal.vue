<script setup lang="ts">
import Tag from "primevue/tag";
import { useI18n } from "vue-i18n";
import type { MembershipStatusSignal } from "../../../api/domain";

defineProps<{ signal: MembershipStatusSignal }>();
const { t } = useI18n();
</script>

<template>
  <Tag
    class="membership-signal"
    :data-signal="signal"
    :value="t(`newMembershipTopic.signals.${signal}`)"
    :aria-label="t('newMembershipTopic.signalMeaning', { signal: t(`newMembershipTopic.signals.${signal}`) })"
  />
</template>

<style scoped>
.membership-signal[data-signal="new"] {
  --p-tag-background: #fee2e2;
  --p-tag-color: #991b1b;
}

.membership-signal[data-signal="in_progress"] {
  --p-tag-background: #dbeafe;
  --p-tag-color: #1e40af;
}

.membership-signal[data-signal="nearly_finished"] {
  --p-tag-background: #dcfce7;
  --p-tag-color: #166534;
}

.membership-signal[data-signal="attention"] {
  --p-tag-background: #fef9c3;
  --p-tag-color: #854d0e;
}

.membership-signal[data-signal="paused"] {
  --p-tag-background: #ffedd5;
  --p-tag-color: #9a3412;
}
</style>
