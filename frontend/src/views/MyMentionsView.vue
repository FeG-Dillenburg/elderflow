<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Message from "primevue/message";
import { protectedText } from "../e2ee/protected-text";
import { currentMentions, type CurrentMention } from "../mentions/current";
import { formatDate } from "../i18n";

const { t } = useI18n();
const rows = ref<CurrentMention[]>([]);
const loading = ref(false);
const error = ref<"error" | "unavailable" | null>(null);
const unlocked = computed(() => protectedText.state.status === "unlocked");
let controller: AbortController | null = null;

watch(unlocked, async (ready) => {
  controller?.abort();
  rows.value = [];
  error.value = null;
  loading.value = false;
  if (!ready) return;
  const current = new AbortController();
  controller = current;
  loading.value = true;
  try {
    const loaded = await currentMentions(current.signal);
    if (!current.signal.aborted && unlocked.value) rows.value = loaded;
  } catch (cause) {
    if (!current.signal.aborted && unlocked.value) {
      error.value = cause instanceof Error && cause.message.startsWith("E2EE_") ? "unavailable" : "error";
    }
  } finally {
    if (!current.signal.aborted) loading.value = false;
  }
}, { immediate: true, flush: "sync" });
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t("mentions.eyebrow") }}</p>
        <h1>{{ t("mentions.title") }}</h1>
        <p>{{ t("mentions.description") }}</p>
      </div>
    </header>
    <Message v-if="!unlocked" severity="info" role="status">
      <div class="unlock-prompt">
        <span>{{ t("mentions.locked") }}</span>
        <Button
          :label="t('mentions.unlock')"
          icon="pi pi-lock-open"
          size="small"
          @click="protectedText.showUnlock()"
        />
      </div>
    </Message>
    <Message v-else-if="error" severity="error" role="alert">
      {{ t(`mentions.${error}`) }}
    </Message>
    <div v-else class="table-card">
      <DataTable
        :value="rows"
        :loading="loading"
        :table-props="{ 'aria-label': t('mentions.title') }"
        data-key="id"
      >
        <template #empty>
          <span role="status">
            {{ t(loading ? "mentions.loading" : "mentions.empty") }}
          </span>
        </template>
        <Column :header="t('mentions.topic')">
          <template #body="{ data }">
            <RouterLink class="topic-link" :to="`/topics/${data.topicId}`">
              {{ data.topicName }}
            </RouterLink>
          </template>
        </Column>
        <Column :header="t('mentions.context')">
          <template #body="{ data }">
            <div class="context">{{ data.context }}</div>
          </template>
        </Column>
        <Column :header="t('mentions.meeting')">
          <template #body="{ data }">
            <RouterLink class="meeting-link" :to="`/meetings/${data.meetingId}`">
              {{ data.meetingTitle }} · {{ formatDate(data.date) }}
            </RouterLink>
          </template>
        </Column>
      </DataTable>
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
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
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

.table-card {
  overflow: hidden;
  border: 1px solid #e2e6ec;
  border-radius: 0.8rem;
  background: #fff;
}

.topic-link,
.meeting-link {
  color: #607dae;
  text-decoration: none;
}

.context {
  white-space: pre-wrap;
  min-width: 15rem;
  overflow-wrap: anywhere;
}

.unlock-prompt {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.7rem;
}

@media (max-width: 650px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
