<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import type { MeetingTopic } from "../../../api/domain";
import PairedMeetingTexts from "../../components/PairedMeetingTexts.vue";
import { useI18n } from "vue-i18n";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  item: MeetingTopic;
  number?: string;
  canEdit?: boolean;
  meetingStatus?: string;
  canWriteMinutes?: boolean;
  toggleDeferred?: () => Promise<void>;
  savePreparationContext?: (text: string | null) => Promise<unknown>;
  saveMinutes?: (text: string | null) => Promise<unknown>;
}>();
const { t } = useI18n();
const meetingTextMode = computed(() => props.meetingStatus === "in_progress"
  ? "active"
  : props.meetingStatus === "completed"
    ? "completed"
    : "preparation");
const savePreparation = (text: string | null) =>
  props.savePreparationContext?.(text) ?? Promise.resolve();
const saveCurrentMinutes = (text: string | null) =>
  props.saveMinutes?.(text) ?? Promise.resolve();
</script>

<template>
  <div class="recurring-agenda">
    <span class="number">{{ number }}</span>
    <div>
      <RouterLink :to="`/topics/${item.topicId}`" class="topic-name">
        {{ item.topicNameSnapshot ?? item.topic?.name }}
      </RouterLink>
      <PairedMeetingTexts
        :item="item"
        :mode="meetingTextMode"
        :can-write-minutes="canWriteMinutes"
        :save-preparation="savePreparation"
        :save-minutes="saveCurrentMinutes"
      />
      <div v-if="canEdit" class="topic-footer">
        <Button
          :aria-pressed="item.topic?.status === 'deferred'"
          :label="
            item.topic?.status === 'deferred'
              ? t('meetingAgenda.deferred')
              : t('meetingAgenda.defer')
          "
          :severity="item.topic?.status === 'deferred' ? 'danger' : 'secondary'"
          text
          @click="toggleDeferred"
        />
      </div>
    </div>
    <span v-if="item.plannedDuration" class="duration">
      {{ item.plannedDuration }} {{ t("common.minuteShort") }}
    </span>
  </div>
</template>

<style scoped>
.recurring-agenda {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 0.7rem;
}

.number,
.topic-name {
  font-weight: 800;
}

.topic-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

.number {
  color: #607dae;
}

.topic-name {
  display: block;
  margin-bottom: 0.45rem;
  text-decoration: none;
}

@media (max-width: 700px) {
  .recurring-agenda {
    grid-template-columns: 1fr;
  }
}
</style>
