<script setup lang="ts">
import { computed } from "vue";
import Tag from "primevue/tag";
import { useI18n } from "vue-i18n";
import type { MembershipStatusSignal } from "../../../api/domain";
import {
  membershipSignalIcons,
  membershipSignalStyles,
} from "./membershipStatusPresentation";

const props = defineProps<{
  signal: MembershipStatusSignal;
  text?: string | null;
}>();
const { t } = useI18n();
const signalLabel = computed(() => t(`newMembershipTopic.signals.${props.signal}`));
const displayText = computed(() => props.text === undefined ? signalLabel.value : props.text ?? "");
const accessibleLabel = computed(() => {
  const meaning = t("newMembershipTopic.signalMeaning", { signal: signalLabel.value });
  return displayText.value && displayText.value !== signalLabel.value
    ? `${meaning}. ${displayText.value}`
    : meaning;
});
</script>

<template>
  <Tag
    class="membership-signal"
    :data-signal="signal"
    :icon="membershipSignalIcons[signal]"
    :style="membershipSignalStyles[signal]"
    :value="displayText"
    :aria-label="accessibleLabel"
  />
</template>

<style scoped>
.membership-signal {
  max-width: 100%;
}

.membership-signal :deep(.p-tag-label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
