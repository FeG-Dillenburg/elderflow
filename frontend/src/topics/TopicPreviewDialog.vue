<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import Message from "primevue/message";
import { api, type Topic, type TopicHistoryEntry } from "../api/domain";
import { auth } from "../auth/auth";
import { protectedText } from "../e2ee/protected-text";
import TopicHistoryTimeline from "./history/TopicHistoryTimeline.vue";

const props = defineProps<{ topicId: string | null }>();
const emit = defineEmits<{ "update:topicId": [id: string | null] }>();
const { t } = useI18n();
const topic = ref<Topic | null>(null);
const history = ref<TopicHistoryEntry[]>([]);
const topicLoading = ref(false);
const historyLoading = ref(false);
const topicError = ref(false);
const historyError = ref(false);
let generation = 0;
const visible = computed(() => props.topicId !== null);

function clear() {
  generation++;
  topic.value = null;
  history.value = [];
  topicError.value = false;
  historyError.value = false;
  topicLoading.value = false;
  historyLoading.value = false;
}

function close() {
  clear();
  emit("update:topicId", null);
}

async function loadTopic(id: string, attempt: number) {
  topicLoading.value = true;
  topicError.value = false;
  try {
    const result = await api.topic(id);
    if (attempt === generation) topic.value = result;
  } catch {
    if (attempt === generation) topicError.value = true;
  } finally {
    if (attempt === generation) topicLoading.value = false;
  }
}

async function loadHistory(id: string, attempt: number) {
  historyLoading.value = true;
  historyError.value = false;
  try {
    const result = await api.topicHistory(id);
    if (attempt === generation) history.value = result;
  } catch {
    if (attempt === generation) historyError.value = true;
  } finally {
    if (attempt === generation) historyLoading.value = false;
  }
}

watch(
  () => props.topicId,
  (id) => {
    clear();
    if (id) {
      void loadTopic(id, generation);
      void loadHistory(id, generation);
    }
  },
  { immediate: true, flush: "sync" },
);
watch(
  [() => auth.state.user?.id, () => protectedText.state.status],
  close,
  { flush: "sync" },
);
window.addEventListener("elderflow:before-logout", close);
onBeforeUnmount(() => {
  clear();
  window.removeEventListener("elderflow:before-logout", close);
});
</script>

<template>
  <Dialog
    :visible="visible"
    :header="topic
      ? t('topicPreview.titleWithTopic', { name: topic.name })
      : t('topicPreview.title')"
    :style="{ width: '70rem', maxWidth: 'calc(100vw - 1rem)', height: '90dvh', maxHeight: '90dvh' }"
    :pt="{ mask: { class: 'topic-preview-mask' } }"
    class="topic-preview-dialog"
    modal
    dismissable-mask
    block-scroll
    @update:visible="!$event && close()"
  >
    <div v-if="topicLoading" role="status">{{ t("common.loading") }}</div>
    <Message v-else-if="topicError" severity="error" :closable="false">
      {{ t("topicDetail.loadFailed") }}
      <Button
        :label="t('topicPreview.retryTopic')"
        text
        @click="topicId && loadTopic(topicId, generation)"
      />
    </Message>
    <TopicHistoryTimeline
      :entries="history"
      :current-topic-name="topic?.name"
      :loading="historyLoading"
      :error="historyError ? t('topicHistory.loadFailed') : ''"
    />
    <Button
      v-if="historyError"
      :label="t('topicPreview.retryHistory')"
      text
      @click="topicId && loadHistory(topicId, generation)"
    />
  </Dialog>
</template>

<style>
.topic-preview-dialog .p-dialog-header {
  flex-shrink: 0;
  align-items: flex-start;
  gap: 0.75rem;
}

.topic-preview-dialog .p-dialog-header-actions {
  flex-shrink: 0;
}

.topic-preview-dialog .p-dialog-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.topic-preview-dialog .p-dialog-content {
  min-height: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
}

.topic-preview-mask {
  background: rgb(0 0 0 / 40%);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
</style>
