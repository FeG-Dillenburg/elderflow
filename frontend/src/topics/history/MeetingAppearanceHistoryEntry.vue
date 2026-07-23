<script setup lang="ts">
import Tag from "primevue/tag";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../i18n";
import { meetingLabel, type TopicHistoryEntry } from "../../api/domain";
import MembershipSignal from "../types/new-membership/MembershipSignal.vue";
import { sanitizeHistoryRichText } from "./sanitizeHistoryRichText";

const props = defineProps<{
  entry: Extract<TopicHistoryEntry, { kind: "meeting_appearance" }>;
  currentTopicName?: string;
}>();
const { t } = useI18n();
const showTopicName = computed(() => props.currentTopicName === undefined
  || props.entry.topic.name !== props.currentTopicName);
const showResponsible = computed(() => !props.entry.deferredAt);
const showTopicSnapshot = computed(() => showTopicName.value
  || showResponsible.value
  || props.entry.topic.type === "new_membership");
const topicSnapshotValueCount = computed(() => Number(showTopicName.value)
  + Number(showResponsible.value)
  + Number(props.entry.topic.type === "new_membership"));
const appearanceNote = computed(() => props.entry.topic.type === "person"
  ? props.entry.personNote
  : props.entry.preparationContext);
const noteLabel = computed(() => props.entry.topic.type === "person"
  ? t("personTopic.noteLabel")
  : t("meetingTexts.preparationContext"));
</script>

<template>
  <article class="history-entry meeting-entry">
    <span class="entry-icon" aria-hidden="true">
      <i class="pi pi-users" />
    </span>
    <div class="meeting-card">
      <header class="meeting-header">
        <div>
          <p class="meeting-kicker">{{ t("common.meeting") }}</p>
          <div class="meeting-reference">
            <RouterLink :to="`/meetings/${entry.meeting.id}`" class="meeting-link">
              {{ meetingLabel(entry.meeting) }}
              <i class="pi pi-arrow-up-right" aria-hidden="true" />
            </RouterLink>
            <span v-if="entry.deferredAt" class="deferred-marker">
              {{ t("meetingAgenda.deferred") }}
            </span>
          </div>
          <p class="meeting-meta">
            <time :datetime="entry.effectiveAt">
              {{ formatDate(entry.effectiveAt, { dateStyle: "medium", timeStyle: "short" }) }}
            </time>
            <span v-if="entry.section">{{ entry.section.name }}</span>
          </p>
        </div>
        <Tag :value="t(`labels.${entry.meeting.status}`)" severity="secondary" />
      </header>

      <section
        v-if="showTopicSnapshot"
        class="topic-snapshot"
        :class="{
          'single-value': topicSnapshotValueCount === 1,
          'membership-summary': entry.topic.type === 'new_membership',
          'has-topic-name': showTopicName,
          'without-responsible': !showResponsible,
        }"
      >
        <div v-if="showTopicName">
          <span>{{ t("topicHistory.topicAtMeeting") }}</span>
          <strong>{{ entry.topic.name || t("common.none") }}</strong>
        </div>
        <div v-if="showResponsible">
          <span>{{ t("topicDetail.responsible") }}</span>
          <strong>{{ entry.topic.responsibleUserDisplayName || t("common.unassigned") }}</strong>
        </div>
        <div v-if="entry.topic.type === 'new_membership'">
          <span>{{ t("common.status") }}</span>
          <MembershipSignal
            :signal="entry.topic.membershipStatusSignal ?? 'new'"
            :text="entry.topic.membershipProcessStatus || t('common.none')"
          />
        </div>
      </section>

      <section v-if="entry.topic.type === 'new_membership'" class="membership-snapshot">
        <div>
          <span>{{ t("newMembershipTopic.godparents") }}</span>
          <strong>{{ entry.topic.godparents || t("common.none") }}</strong>
        </div>
      </section>

      <section v-if="appearanceNote" class="meeting-content">
        <h3>{{ noteLabel }}</h3>
        <div class="rich-content" v-html="sanitizeHistoryRichText(appearanceNote)" />
      </section>

      <section v-if="entry.meetingMinutes.length" class="minutes-list">
        <h3>{{ t("meetingTexts.meetingMinutes") }}</h3>
        <article v-for="minute in entry.meetingMinutes" :key="minute.id" class="minute">
          <div class="rich-content" v-html="sanitizeHistoryRichText(minute.text)" />
          <p>
            <time :datetime="minute.effectiveAt">
              {{ formatDate(minute.effectiveAt, { timeStyle: "short" }) }}
            </time>
            <span>{{ minute.createdByDisplayName || t("topicHistory.unknownAuthor") }}</span>
          </p>
        </article>
      </section>
    </div>
  </article>
</template>

<style scoped>
.entry-icon {
  background: #dfe9fb;
  color: #41689f;
}

.meeting-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dce4ef;
  border-radius: 0.9rem;
  background: #fff;
  box-shadow: 0 9px 25px rgb(35 55 80 / 7%);
}

.meeting-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid #e8edf3;
  background: linear-gradient(135deg, #f7faff, #fff);
}

.meeting-kicker,
.meeting-meta {
  margin: 0;
}

.meeting-kicker {
  color: #6680aa;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.meeting-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0;
  color: #294e80;
  font-size: 1.05rem;
  font-weight: 750;
  text-decoration: none;
}

.meeting-reference {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.65rem;
}

.deferred-marker {
  color: #c53d3d;
  font-size: 1.05rem;
  font-weight: 750;
}

.meeting-link:hover {
  text-decoration: underline;
}

.meeting-link i {
  font-size: 0.7rem;
}

.meeting-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  color: #718096;
  font-size: 0.76rem;
}

.meeting-meta span::before {
  margin-right: 0.65rem;
  content: "·";
}

.topic-snapshot,
.membership-snapshot {
  display: grid;
  gap: 0.75rem 1rem;
  padding: 0.9rem 1.1rem;
  background: #fbfcfe;
}

.topic-snapshot {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  border-bottom: 1px solid #edf1f5;
}

.topic-snapshot.single-value {
  grid-template-columns: 1fr;
}

.topic-snapshot.membership-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.topic-snapshot.membership-summary.has-topic-name {
  grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr));
}

.topic-snapshot.membership-summary.without-responsible {
  grid-template-columns: 1fr;
}

.topic-snapshot.membership-summary.has-topic-name.without-responsible {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
}

.membership-snapshot {
  grid-template-columns: 1fr;
  border-bottom: 1px solid #edf1f5;
}

.topic-snapshot div,
.membership-snapshot div {
  min-width: 0;
}

.topic-snapshot span,
.membership-snapshot span {
  display: block;
  margin-bottom: 0.2rem;
  color: #718096;
  font-size: 0.7rem;
}

.topic-snapshot strong,
.membership-snapshot strong {
  overflow-wrap: anywhere;
  font-size: 0.84rem;
}

.meeting-content,
.minutes-list {
  padding: 1rem 1.1rem;
}

.meeting-content + .minutes-list {
  border-top: 1px solid #edf1f5;
}

h3 {
  margin: 0 0 0.65rem;
  color: #526378;
  font-size: 0.74rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.rich-content {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.55;
}

.rich-content :deep(p) {
  margin: 0.25rem 0;
}

.minute {
  padding: 0.7rem 0 0.7rem 0.9rem;
  border-left: 2px solid #d5dfed;
}

.minute + .minute {
  margin-top: 0.4rem;
}

.minute p {
  display: flex;
  gap: 0.6rem;
  margin: 0.4rem 0 0;
  color: #7a8799;
  font-size: 0.72rem;
}

@media (max-width: 620px) {
  .topic-snapshot,
  .membership-snapshot {
    grid-template-columns: 1fr;
  }
}
</style>
