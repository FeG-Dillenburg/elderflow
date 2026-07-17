<script lang="ts" setup>
import {onMounted, ref} from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import {RouterLink} from 'vue-router';
import {api, formatUser, meetingLabel, type DashboardData} from '../api/domain';
import {useI18n} from 'vue-i18n';
import {formatDate} from '../i18n';

const data = ref<DashboardData | null>(null);
const error = ref('');
const {t} = useI18n();
onMounted(async () => {
  try {
    data.value = await api.dashboard();
  } catch (value) {
    error.value = value instanceof Error ? value.message : t('dashboard.loadFailed');
  }
});
const date = (value: string | null) => value ? formatDate(`${value}T12:00:00`) : t('dashboard.noDate');
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div><p class="eyebrow">{{ t('dashboard.eyebrow') }}</p>
        <h1>{{ t('dashboard.title') }}</h1>
        <p>{{ t('dashboard.description') }}</p></div>
    </header>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-if="data" class="dashboard-grid">
      <Card class="next-meeting">
        <template #title>{{ t('dashboard.nextMeeting') }}</template>
        <template #content>
          <template v-if="data.nextMeeting"><h2>{{ meetingLabel(data.nextMeeting) }}</h2>
            <p>{{ date(data.nextMeeting.date) }} {{ t('common.at') }} {{ data.nextMeeting.beginTime.slice(0, 5) }}</p>
            <p class="muted">{{ t('dashboard.leader', { name: formatUser(data.nextMeeting.meetingLeader) }) }}</p>
            <RouterLink :to="`/meetings/${data.nextMeeting.id}`">
              <Button icon="pi pi-arrow-right" icon-pos="right" :label="t('dashboard.openAgenda')"/>
            </RouterLink>
          </template>
          <p v-else class="muted">{{ t('dashboard.noMeeting') }}</p>
        </template>
      </Card>
      <Card>
        <template #title>{{ t('dashboard.myTasks') }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="task in data.myOpenTasks" :key="task.id">
              <RouterLink :to="task.topicId ? `/topics/${task.topicId}` : '/tasks'">{{ task.title }}</RouterLink>
              <small>{{ task.dueDate ? t('dashboard.due', { date: date(task.dueDate) }) : t('dashboard.noDueDate') }}</small></li>
            <li v-if="!data.myOpenTasks.length" class="empty">{{ t('dashboard.nothingAssigned') }}</li>
          </ul>
        </template>
      </Card>
      <Card>
        <template #title>{{ t('dashboard.overdue') }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="task in data.overdueTasks" :key="task.id"><span>{{
                task.title
              }}</span><small>{{ formatUser(task.assignedTo) }} · {{ t('dashboard.dueBy', { date: date(task.dueDate) }) }}</small></li>
            <li v-if="!data.overdueTasks.length" class="empty">{{ t('dashboard.noOverdue') }}</li>
          </ul>
        </template>
      </Card>
      <Card>
        <template #title>{{ t('dashboard.followUps') }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="topic in data.followUpTopics" :key="topic.id">
              <RouterLink :to="`/topics/${topic.id}`">{{ topic.name }}</RouterLink>
              <small>{{ date(topic.followUpDate) }} · {{ formatUser(topic.responsibleUser) }}</small></li>
            <li v-if="!data.followUpTopics.length" class="empty">{{ t('dashboard.noFollowUps') }}</li>
          </ul>
        </template>
      </Card>
      <Card>
        <template #title>{{ t('dashboard.recentTopics') }}</template>
        <template #content>
          <ul class="item-list">
            <li v-for="topic in data.recentTopics" :key="topic.id">
              <RouterLink :to="`/topics/${topic.id}`">{{ topic.name }}</RouterLink>
              <Tag :value="topic.status" severity="secondary"/>
            </li>
            <li v-if="!data.recentTopics.length" class="empty">{{ t('dashboard.noTopics') }}</li>
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
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 .3rem;
  color: #607dae;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 2.2rem;
  letter-spacing: -.04em;
}

.page-header p:last-child {
  margin: .45rem 0 0;
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

.next-meeting {
  grid-column: span 2;
  background: linear-gradient(120deg, #fff, #f1f5fc);
}

.next-meeting h2 {
  margin: 0 0 .35rem;
}

.muted, .item-list small {
  color: #718096;
}

.item-list {
  display: grid;
  gap: .8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: .75rem;
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
  font-size: .78rem;
  text-align: right;
}

.empty {
  color: #718096;
}

@media (max-width: 750px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .next-meeting {
    grid-column: auto;
  }
}
</style>
