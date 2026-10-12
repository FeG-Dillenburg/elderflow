<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
  <section class="my-mentions">
    <h1>{{ t("mentions.title") }}</h1>
    <div v-if="!unlocked" role="status">
      <p>{{ t("mentions.locked") }}</p>
      <button type="button" @click="protectedText.showUnlock()">
        {{ t("mentions.unlock") }}
      </button>
    </div>
    <p v-else-if="loading" role="status">{{ t("mentions.loading") }}</p>
    <p v-else-if="error" role="alert">{{ t(`mentions.${error}`) }}</p>
    <p v-else-if="!rows.length" role="status">{{ t("mentions.empty") }}</p>
    <div v-else class="table-scroll">
      <table>
        <caption class="visually-hidden">{{ t("mentions.title") }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t("mentions.topic") }}</th>
            <th scope="col">{{ t("mentions.context") }}</th>
            <th scope="col">{{ t("mentions.meeting") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <RouterLink :to="`/topics/${row.topicId}`">{{ row.topicName }}</RouterLink>
            </td>
            <td class="context">{{ row.context }}</td>
            <td>
              <RouterLink :to="`/meetings/${row.meetingId}`">
                {{ row.meetingTitle }} · {{ formatDate(row.date) }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: start;
}

th,
td {
  padding: 0.8rem;
  border-bottom: 1px solid #d6dce5;
  vertical-align: top;
}

.context {
  white-space: pre-wrap;
  min-width: 15rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
