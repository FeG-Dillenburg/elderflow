<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import DOMPurify from "dompurify";
import Button from "primevue/button";
import TopicDoneButton from "../../TopicDoneButton.vue";
import type { MeetingTopic, TopicUpdate } from "../../../api/domain";
import { formatUser } from "../../../api/domain";
import { formatDate } from "../../../i18n";
import { useI18n } from "vue-i18n";
import PairedMeetingTexts from "../../components/PairedMeetingTexts.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  item: MeetingTopic;
  number?: string;
  canEdit?: boolean;
  recentUpdates?: TopicUpdate[];
  toggleDeferred?: () => Promise<void>;
  markDone?: () => Promise<void>;
  meetingStatus?: string;
  canWriteMinutes?: boolean;
  savePreparationContext?: (text: string | null) => Promise<unknown>;
  saveMinutes?: (text: string | null) => Promise<unknown>;
}>();

const { t } = useI18n();
const safe = (html: string | null | undefined) => DOMPurify.sanitize(html ?? "");
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
  <div class="generic-agenda">
    <div class="topic-heading">
      <span v-if="number" class="number">{{ number }}</span>
      <RouterLink v-if="item.topic" :to="`/topics/${item.topicId}`">
        <h3>{{ item.topic.name }}</h3>
        <p>
          {{
            item.responsibleUserDisplayNameSnapshot ??
            formatUser(item.topic.responsibleUser)
          }}
        </p>
      </RouterLink>
      <div v-if="item.plannedDuration" class="topic-meta">
        {{ item.plannedDuration }} {{ t("common.minuteShort") }}
      </div>
    </div>
    <div v-if="recentUpdates?.length" class="updates">
      <p class="section-label">{{ t("meetingAgenda.recentUpdates") }}</p>
      <div v-for="update in recentUpdates" :key="update.id" class="update">
        <div v-html="safe(update.text)" />
        <small>
          {{ formatDate(update.date, { dateStyle: "short", timeStyle: "short" }) }}
          · {{ formatUser(update.createdBy) }}
        </small>
      </div>
    </div>
    <PairedMeetingTexts
      class="meeting-texts"
      :item="item"
      :mode="meetingTextMode"
      :can-write-minutes="canWriteMinutes"
      :save-preparation="savePreparation"
      :save-minutes="saveCurrentMinutes"
    />
    <div v-if="item.topic?.tasks?.length" class="tasks">
      <p class="section-label">{{ t("meetingAgenda.openTasks") }}</p>
      <p v-for="task in item.topic.tasks" :key="task.id">
        <i class="pi pi-check-square" />
        {{ task.title }}
        <small>
          {{ formatUser(task.assignedTo) }}
          <template v-if="task.dueDate">
            · {{ formatDate(`${task.dueDate}T12:00:00`) }}
          </template>
        </small>
      </p>
    </div>
    <div v-if="canEdit" class="topic-footer">
      <span />
      <span>
        <Button
          :aria-pressed="item.topic?.status === 'deferred'"
          :label="item.topic?.status === 'deferred' ? t('meetingAgenda.deferred') : t('meetingAgenda.defer')"
          :severity="item.topic?.status === 'deferred' ? 'danger' : 'secondary'"
          text
          @click="toggleDeferred"
        />
        <TopicDoneButton
          :done="item.topic?.status === 'done'"
          @toggle="markDone"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.topic-heading {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 0.7rem;
  align-items: start;
}

.number {
  padding-top: 0.2rem;
  color: #607dae;
  font-size: 0.96rem;
  font-weight: 800;
}

.topic-heading a {
  text-decoration: none;
}

h3 {
  margin: 0;
  font-size: 1.05rem;
}

.topic-heading p {
  margin: 0.25rem 0 0;
}

.topic-meta {
  margin: 0.25rem 0 0;
}

.section-label {
  margin: 0.9rem 0 0.45rem;
  color: #607dae;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.updates,
.tasks,
.meeting-texts {
  margin-left: 72px;
}

.update {
  margin-bottom: 0.45rem;
  padding: 0.65rem 0.8rem;
  border-radius: 0.5rem;
  background: #f5f7fa;
}

.update :deep(p) {
  margin: 0 0 0.3rem;
}

.tasks p {
  margin: 0.3rem 0;
}

.topic-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.75rem 0 0 64px;
  padding-top: 0.45rem;
}

@media (max-width: 700px) {
  .topic-heading {
    grid-template-columns: 1fr;
  }

  .number {
    padding: 0;
  }

  .updates,
  .tasks,
  .meeting-texts,
  .topic-footer {
    margin-left: 0;
  }
}
</style>
