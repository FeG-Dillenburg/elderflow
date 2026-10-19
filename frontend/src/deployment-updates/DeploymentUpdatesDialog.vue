<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { useI18n } from "vue-i18n";
import { formatDate } from "../i18n";
import { deploymentUpdates, type DeploymentAnnouncement } from "./deployment-updates";

const { t, te, locale } = useI18n();
const state = deploymentUpdates.state;
const content = ref<HTMLElement | null>(null);
watch(() => state.entries, () => {
  if (content.value) content.value.scrollTop = 0;
}, { flush: "post" });
const icons = { feature: "🚀", improvement: "📈", bugfix: "🪲" };
const groups = computed(() => {
  // Locale participates in the computation so open dialogs update immediately.
  void locale.value;
  const result = new Map<string, DeploymentAnnouncement[]>();
  const entries = [...state.entries].sort((a, b) =>
    Date.parse(a.registeredAt) - Date.parse(b.registeredAt)
    || a.identifier.localeCompare(b.identifier));
  for (const entry of entries) {
    const date = formatDate(entry.registeredAt);
    const group = result.get(date) ?? [];
    group.push(entry);
    result.set(date, group);
  }
  return [...result].map(([date, entries]) => ({ date, entries }));
});

function entryText(entry: DeploymentAnnouncement): string {
  const key = `deploymentUpdates.entries.${entry.identifier}`;
  return te(key) ? t(key) : t("deploymentUpdates.fallback");
}
</script>

<template>
  <Message
    v-if="state.warning"
    severity="warn"
    role="status"
    class="updates-warning"
  >
    {{ t("deploymentUpdates.unavailable") }}
  </Message>
  <Dialog
    :visible="state.visible"
    modal
    :header="t('deploymentUpdates.title')"
    :closable="false"
    :close-on-escape="false"
    :dismissable-mask="false"
    :style="{ width: '38rem', maxWidth: 'calc(100vw - 2rem)' }"
  >
    <div
      ref="content"
      class="updates-content"
      role="region"
      tabindex="0"
      :aria-label="t('deploymentUpdates.listLabel')"
      :aria-busy="state.loading || state.saving"
    >
      <p v-if="state.loading" role="status">
        {{ t("deploymentUpdates.loading") }}
      </p>
      <Message v-else-if="state.error" severity="error" :closable="false" role="alert">
        {{ t(state.mode === "unread" ? "deploymentUpdates.acknowledgeFailed" : "deploymentUpdates.historyFailed") }}
      </Message>
      <p v-if="!state.loading && !state.error && !state.entries.length">
        {{ t("deploymentUpdates.empty") }}
      </p>
      <p v-if="state.mode === 'unread' && state.remainingCount" role="status">
        {{ t("deploymentUpdates.moreUnread", { count: state.remainingCount }) }}
      </p>
      <section v-for="group in groups" :key="group.date" class="date-group">
        <h2>{{ group.date }}:</h2>
        <ul>
          <li v-for="entry in group.entries" :key="entry.id">
            <span aria-hidden="true">{{ icons[entry.category] ?? "📈" }}</span>
            <span class="category-label">
              {{ t(`deploymentUpdates.categories.${entry.category in icons ? entry.category : 'improvement'}`) }}:
            </span>
            {{ entryText(entry) }}
          </li>
        </ul>
      </section>
    </div>
    <template #footer>
      <Button
        v-if="state.mode === 'unread'"
        :label="t('deploymentUpdates.continue')"
        :loading="state.saving"
        @click="deploymentUpdates.acknowledge()"
      />
      <template v-else>
        <Button
          v-if="state.error"
          :label="t('deploymentUpdates.retry')"
          @click="deploymentUpdates.history()"
        />
        <Button
          :label="t('deploymentUpdates.close')"
          @click="deploymentUpdates.closeHistory()"
        />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.updates-content {
  max-height: 60vh;
  overflow-y: auto;
}

.date-group h2 {
  margin: 1rem 0 0.5rem;
  font-size: 1rem;
}

.date-group ul {
  padding-left: 1.5rem;
}

.date-group li {
  margin: 0.75rem 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.category-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.updates-warning {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  max-width: min(28rem, calc(100vw - 2rem));
  z-index: 1200;
}
</style>
