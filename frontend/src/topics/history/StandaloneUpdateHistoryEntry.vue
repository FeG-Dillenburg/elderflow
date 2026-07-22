<script setup lang="ts">
import Tag from "primevue/tag";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../i18n";
import type { TopicHistoryEntry } from "../../api/domain";
import { sanitizeHistoryRichText } from "./sanitizeHistoryRichText";

defineProps<{
  entry: Extract<TopicHistoryEntry, { kind: "standalone_update" }>;
}>();
const { t } = useI18n();
</script>

<template>
  <article class="history-entry update-entry">
    <span class="entry-icon" aria-hidden="true">
      <i class="pi pi-file-edit" />
    </span>
    <div class="entry-card">
      <header class="entry-header">
        <Tag :value="t('topicHistory.standaloneUpdate')" severity="secondary" />
        <time :datetime="entry.effectiveAt">
          {{ formatDate(entry.effectiveAt, { dateStyle: "medium", timeStyle: "short" }) }}
        </time>
      </header>
      <div class="rich-content" v-html="sanitizeHistoryRichText(entry.text)" />
      <p class="entry-byline">
        {{ entry.createdByDisplayName || t("topicHistory.unknownAuthor") }}
      </p>
    </div>
  </article>
</template>

<style scoped>
.entry-icon {
  background: #e9eef8;
  color: #5673a5;
}

.entry-card {
  min-width: 0;
  padding: 1rem 1.1rem;
  border: 1px solid #e3e8ef;
  border-radius: 0.8rem;
  background: #fff;
  box-shadow: 0 6px 18px rgb(35 55 80 / 5%);
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
}

time,
.entry-byline {
  color: #718096;
  font-size: 0.76rem;
}

.entry-byline {
  margin: 0.7rem 0 0;
}

.rich-content {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.55;
}

.rich-content :deep(p) {
  margin: 0.25rem 0;
}

@media (max-width: 520px) {
  .entry-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
