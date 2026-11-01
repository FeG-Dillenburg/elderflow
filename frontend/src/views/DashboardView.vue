<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Card from "primevue/card";
import Message from "primevue/message";
import Tag from "primevue/tag";
import { RouterLink } from "vue-router";
import {
  api,
  formatUser,
  meetingLabel,
  type DashboardData,
} from "../api/domain";
import { useI18n } from "vue-i18n";
import { formatDate, formatTime } from "../i18n";
import { auth } from "../auth/auth";
import { protectedText } from "../e2ee/protected-text";
import { isE2eeKeyOperator } from "../e2ee/roles";
import { deploymentUpdates } from "../deployment-updates/deployment-updates";
import { tours } from "../tours/tours";
import { currentMentions, type CurrentMention } from "../mentions/current";

const data = ref<DashboardData | null>(null);
const error = ref("");
const { t } = useI18n();
const localHour = ref(new Date().getHours());
const greeting = computed(() => {
  const hour = localHour.value;
  let period = "night";
  if (hour >= 5 && hour < 11) period = "morning";
  else if (hour >= 11 && hour < 14) period = "day";
  else if (hour >= 14 && hour < 18) period = "afternoon";
  else if (hour >= 18 && hour < 22) period = "evening";
  const name = auth.state.user?.firstName?.trim();
  return t(`dashboard.greetings.${period}.${name ? "named" : "anonymous"}`, { name });
});
let clock: ReturnType<typeof setTimeout> | undefined;
function refreshClock(): void {
  clearTimeout(clock);
  const now = new Date();
  localHour.value = now.getHours();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  clock = setTimeout(refreshClock, nextHour.getTime() - now.getTime());
}
function onVisibilityChange(): void {
  if (document.visibilityState === "visible") refreshClock();
}
const mentions = ref<CurrentMention[]>([]);
const mentionsLoading = ref(false);
const mentionsError = ref(false);
const mentionsHasMore = ref(false);
const mentionsEligible = computed(() =>
  isE2eeKeyOperator(auth.state.user)
  && auth.canView("topics")
  && auth.canView("meetings"),
);
const unlocked = computed(() => protectedText.state.status === "unlocked");
let mentionsController: AbortController | undefined;
async function loadMentions(): Promise<void> {
  mentionsController?.abort();
  mentions.value = [];
  mentionsHasMore.value = false;
  mentionsError.value = false;
  mentionsLoading.value = false;
  if (!mentionsEligible.value || !unlocked.value) return;
  const current = new AbortController();
  mentionsController = current;
  mentionsLoading.value = true;
  try {
    const rows = await currentMentions(current.signal, 9, true);
    if (current.signal.aborted) return;
    mentions.value = rows.slice(0, 8);
    mentionsHasMore.value = rows.length > 8;
  } catch {
    if (!current.signal.aborted) mentionsError.value = true;
  } finally {
    if (!current.signal.aborted) mentionsLoading.value = false;
  }
}
watch(
  [unlocked, mentionsEligible, () => auth.state.user?.id],
  loadMentions,
  { immediate: true, flush: "sync" },
);
onMounted(async () => {
  refreshClock();
  document.addEventListener("visibilitychange", onVisibilityChange);
  try {
    data.value = await api.dashboard();
  } catch (value) {
    error.value =
      value instanceof Error ? value.message : t("dashboard.loadFailed");
  }
});
onBeforeUnmount(() => {
  clearTimeout(clock);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  mentionsController?.abort();
});
const date = (value: string | null) =>
  value ? formatDate(`${value}T12:00:00`) : t("dashboard.noDate");
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t("dashboard.eyebrow") }}</p>
        <h1 data-tour-id="dashboard-heading">{{ greeting }}</h1>
        <p>{{ t("dashboard.description") }}</p>
      </div>
      <Button
        class="updates-action"
        :label="t('deploymentUpdates.historyAction')"
        icon="pi pi-megaphone"
        :disabled="deploymentUpdates.state.blocking || Boolean(tours.state.activeId) || protectedText.state.promptVisible"
        @click="deploymentUpdates.history()"
      />
    </header>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-if="data" class="dashboard-grid">
      <Card v-if="data.currentMeeting" class="current-meeting">
        <template #title>{{ t("dashboard.currentMeeting") }}</template>
        <template #content>
          <h2>{{ meetingLabel(data.currentMeeting) }}</h2>
          <p>
            {{ date(data.currentMeeting.date) }} {{ t("common.at") }}
            {{ formatTime(data.currentMeeting.beginTime) }}
          </p>
          <RouterLink :to="`/meetings/${data.currentMeeting.id}`">
            <Button
              icon="pi pi-play-circle"
              icon-pos="right"
              :label="t('dashboard.openCurrentMeeting')"
            />
          </RouterLink>
        </template>
      </Card>
      <Card class="next-meeting">
        <template #title>{{ t("dashboard.nextMeeting") }}</template>
        <template #content>
          <template v-if="data.nextMeeting">
            <h2>{{ meetingLabel(data.nextMeeting) }}</h2>
            <p>
              {{ date(data.nextMeeting.date) }} {{ t("common.at") }}
              {{ formatTime(data.nextMeeting.beginTime) }}
            </p>
            <p class="muted">
              {{
                t("dashboard.leader", {
                  name: formatUser(data.nextMeeting.meetingLeader),
                })
              }}
            </p>
            <RouterLink :to="`/meetings/${data.nextMeeting.id}/prepare`">
              <Button
                icon="pi pi-arrow-right"
                icon-pos="right"
                :label="t('dashboard.openAgenda')"
              />
            </RouterLink>
          </template>
          <p v-else class="muted">{{ t("dashboard.noMeeting") }}</p>
        </template>
      </Card>
      <Card v-if="mentionsEligible" class="newest-mentions">
        <template #title>{{ t("dashboard.newestMentions") }}</template>
        <template #content>
          <div v-if="!unlocked" class="mentions-state" role="status">
            <span>{{ t("mentions.locked") }}</span>
            <Button
              :label="t('mentions.unlock')"
              icon="pi pi-lock-open"
              size="small"
              @click="protectedText.showUnlock()"
            />
          </div>
          <p v-else-if="mentionsLoading" role="status">{{ t("mentions.loading") }}</p>
          <div v-else-if="mentionsError" class="mentions-state" role="alert">
            <span>{{ t("mentions.error") }}</span>
            <Button
              :label="t('dashboard.retryMentions')"
              severity="secondary"
              size="small"
              @click="loadMentions()"
            />
          </div>
          <template v-else>
            <ul class="item-list mention-list">
              <li v-for="mention in mentions" :key="mention.id">
                <RouterLink
                  to="/my-mentions"
                  class="mention-link"
                  :aria-label="t('dashboard.mentionLink', { topic: mention.topicName, meeting: mention.meetingTitle, date: date(mention.date) })"
                >
                  <strong>{{ mention.topicName }}</strong>
                  <span class="mention-context">{{ mention.context }}</span>
                  <small>{{ mention.meetingTitle }} · {{ date(mention.date) }}</small>
                </RouterLink>
              </li>
              <li v-if="!mentions.length" class="empty" role="status">{{ t("mentions.empty") }}</li>
            </ul>
            <div v-if="mentionsHasMore" class="mentions-more">
              <RouterLink to="/my-mentions">
                <Button
                  as="span"
                  :label="t('dashboard.moreMentions')"
                  severity="secondary"
                  size="small"
                />
              </RouterLink>
            </div>
          </template>
        </template>
      </Card>
      <Card v-if="data.myOpenTasks.length">
        <template #title>{{ t("dashboard.myTasks") }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="task in data.myOpenTasks" :key="task.id">
              <RouterLink
                :to="task.topicId ? `/topics/${task.topicId}` : '/tasks'"
              >
                {{ task.title }}
              </RouterLink>
              <small>
                {{
                  task.dueDate
                    ? t("dashboard.due", { date: date(task.dueDate) })
                    : t("dashboard.noDueDate")
                }}
              </small>
            </li>
          </ul>
        </template>
      </Card>
      <Card v-if="data.overdueTasks.length">
        <template #title>{{ t("dashboard.overdue") }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="task in data.overdueTasks" :key="task.id">
              <span>{{ task.title }}</span>
              <small>
                {{ formatUser(task.assignedTo) }} ·
                {{ t("dashboard.dueBy", { date: date(task.dueDate) }) }}
              </small>
            </li>
          </ul>
        </template>
      </Card>
      <Card class="recent-topics">
        <template #title>{{ t("dashboard.recentTopics") }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="topic in data.recentTopics" :key="topic.id">
              <RouterLink :to="`/topics/${topic.id}`">
                {{ topic.name }}
              </RouterLink>
              <Tag :value="t(`labels.${topic.status}`)" severity="secondary" />
            </li>
            <li v-if="!data.recentTopics.length" class="empty">
              {{ t("dashboard.noTopics") }}
            </li>
          </ul>
        </template>
      </Card>
      <Card class="due-topics">
        <template #title>{{ t("dashboard.followUps") }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="topic in data.followUpTopics" :key="topic.id">
              <RouterLink :to="`/topics/${topic.id}`">
                {{ topic.name }}
              </RouterLink>
              <small>
                {{ date(topic.followUpDate) }} ·
                {{ formatUser(topic.responsibleUser) }}
              </small>
            </li>
            <li v-if="!data.followUpTopics.length" class="empty">
              {{ t("dashboard.noFollowUps") }}
            </li>
          </ul>
        </template>
      </Card>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 1250px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.updates-action {
  margin-top: 1.4rem;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -0.04em;
}

.page-header p:last-child {
  margin: 0.45rem 0 0;
  color: #68758a;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.dashboard-grid :deep(.p-card) {
  border: 1px solid #e2e6ec;
  box-shadow: 0 8px 24px rgb(31 41 55 / 4%);
}

.recent-topics {
  grid-column: 1;
}

.due-topics {
  grid-column: 2;
}

.newest-mentions {
  grid-column: 1 / -1;
  min-width: 0;
}

.next-meeting {
  grid-column: span 2;
  background: linear-gradient(120deg, #fff, #f1f5fc);
}

.current-meeting {
  grid-column: span 2;
  border-color: #86efac !important;
  background: linear-gradient(120deg, #f0fdf4, #fff);
}

.next-meeting h2 {
  margin: 0 0 0.35rem;
}

.muted,
.item-list small {
  color: #718096;
}

.item-list {
  display: grid;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #edf0f4;
}

.item-list li:last-child {
  border: 0;
}

.item-list a {
  font-weight: 650;
  text-decoration: none;
}

.item-list small {
  display: block;
  font-size: 0.78rem;
  text-align: right;
}

.empty {
  color: #718096;
}

.mentions-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.mention-link {
  display: grid;
  gap: 0.35rem;
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
}

.mention-context {
  white-space: pre-wrap;
  font-weight: 400;
}

.mention-list small {
  text-align: left;
}

.mentions-more {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

@media (max-width: 750px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .updates-action {
    margin-top: 0;
  }

  .current-meeting,
  .next-meeting,
  .recent-topics,
  .due-topics {
    grid-column: 1 / -1;
  }
}
</style>
