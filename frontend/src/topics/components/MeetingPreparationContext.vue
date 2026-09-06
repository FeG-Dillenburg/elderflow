<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { MeetingTopic } from "../../api/domain";
import { formatUser } from "../../api/domain";
import { formatDate } from "../../i18n";
import { sanitizeRichText } from "../../components/sanitize-rich-text";

defineOptions({ name: "MeetingPreparationContext" });
const props = defineProps<{ item: MeetingTopic }>();
const { t } = useI18n();
const safe = sanitizeRichText;
const previous = computed(() => props.item.previousAppearance);
const updates = computed(() => props.item.topic?.updates ?? []);
const hasPreviousContent = computed(() => Boolean(
  previous.value?.preparationContext?.text
  || previous.value?.personNote?.text
  || previous.value?.meetingMinutes?.text,
));
</script>

<template>
  <div
    v-if="hasPreviousContent || updates.length"
    class="meeting-preparation-context"
  >
    <section v-if="hasPreviousContent" class="context-group">
      <h4>{{ t("meetingPreparation.previousMeeting") }}</h4>
      <div
        v-if="previous?.personNote?.text"
        class="context-entry"
        v-html="safe(previous.personNote.text)"
      />
      <div
        v-if="previous?.preparationContext?.text"
        class="context-entry previous-preparation"
        v-html="safe(previous.preparationContext.text)"
      />
      <div
        v-if="previous?.meetingMinutes?.text"
        class="context-entry previous-minutes"
        v-html="safe(previous.meetingMinutes.text)"
      />
    </section>
    <section v-if="updates.length" class="context-group">
      <h4>{{ t("meetingPreparation.standaloneUpdates") }}</h4>
      <article v-for="update in updates" :key="update.id" class="context-entry update">
        <div v-html="safe(update.text)" />
        <small>
          {{ formatDate(update.date, { dateStyle: "short", timeStyle: "short" }) }}
          <template v-if="update.createdBy">
            · {{ formatUser(update.createdBy) }}
          </template>
        </small>
      </article>
    </section>
  </div>
</template>

<style scoped>
.meeting-preparation-context {
  display: grid;
  gap: 0.65rem;
  margin: 0.8rem 0;
}

.context-group {
  display: grid;
  gap: 0.4rem;
}

h4 {
  margin: 0;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.context-entry {
  overflow-wrap: anywhere;
  padding: 0.65rem 0.8rem;
  border-radius: 0.5rem;
  background: #f5f7fa;
  line-height: 1.5;
}

.previous-preparation {
  color: #6c7b8f;
}

.previous-minutes {
  color: #17243a;
}

.context-entry :deep(p) {
  margin: 0.2rem 0;
}

small {
  color: #718096;
  font-size: 0.75rem;
}
</style>
