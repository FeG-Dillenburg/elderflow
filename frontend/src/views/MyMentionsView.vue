<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import vTooltip from "primevue/tooltip";
import Message from "primevue/message";
import RichTextEditor from "../components/RichTextEditor.vue";
import { hasMeaningfulRichText, sanitizeRichText } from "../components/sanitize-rich-text";
import { auth } from "../auth/auth";
import { classifyMeetingFailure } from "../e2ee/meeting-failure";
import { protectedText } from "../e2ee/protected-text";
import { protectStandaloneUpdate } from "../e2ee/topic-scalars";
import { currentMentions, resolveMentionWithComment, setMentionState, type CurrentMention } from "../mentions/current";
import { formatDate } from "../i18n";

const { t } = useI18n();
const rows = ref<CurrentMention[]>([]);
const loading = ref(false);
const error = ref<"error" | "unavailable" | null>(null);
const actionError = ref("");
const status = ref("");
const pending = ref(new Set<string>());
const container = ref<HTMLElement>();
const selected = ref<CurrentMention | null>(null);
const draft = ref("");
const operation = ref<{ id: string; textEnvelope: string } | null>(null);
const dialogVisible = computed({
  get: () => Boolean(selected.value),
  set: (value: boolean) => { if (!value) closeDialog(); },
});
const unlocked = computed(() => protectedText.state.status === "unlocked");
const canComment = computed(() => auth.canManage("topics"));
const groups = computed(() => [
  { key: "open", rows: rows.value.filter((row) => !row.done) },
  { key: "done", rows: rows.value.filter((row) => row.done) },
]);
let controller: AbortController | null = null;

function closeDialog() {
  selected.value = null;
  draft.value = "";
  operation.value = null;
}

async function load(current: AbortController) {
  loading.value = true;
  error.value = null;
  try {
    const loaded = await currentMentions(current.signal);
    if (!current.signal.aborted && unlocked.value) rows.value = loaded;
  } catch (cause) {
    if (!current.signal.aborted && unlocked.value) {
      if (classifyMeetingFailure(cause) === "access") {
        protectedText.lock("authorization-loss");
        return;
      }
      error.value = cause instanceof Error && cause.message.startsWith("E2EE_") ? "unavailable" : "error";
    }
  } finally {
    if (!current.signal.aborted) loading.value = false;
  }
}

function retryLoad() {
  if (controller && unlocked.value) void load(controller);
}

watch([unlocked, () => auth.state.user?.id], ([ready]) => {
  controller?.abort();
  controller = null;
  rows.value = [];
  error.value = null;
  actionError.value = "";
  status.value = "";
  pending.value.clear();
  loading.value = false;
  closeDialog();
  if (!ready) return;
  controller = new AbortController();
  void load(controller);
}, { immediate: true, flush: "sync" });

function openComment(row: CurrentMention) {
  if (!unlocked.value || !canComment.value || pending.value.has(row.id)) return;
  actionError.value = "";
  selected.value = row;
  draft.value = "";
  operation.value = null;
}

async function changeState(row: CurrentMention, withComment = false) {
  const current = controller;
  if (!current || current.signal.aborted || !unlocked.value || pending.value.has(row.id)) return;
  if (withComment && (!canComment.value || !hasMeaningfulRichText(draft.value))) return;
  pending.value.add(row.id);
  actionError.value = "";
  status.value = "";
  try {
    if (withComment && !operation.value) {
      const encrypted = await protectStandaloneUpdate(crypto.randomUUID(), sanitizeRichText(draft.value));
      current.signal.throwIfAborted();
      operation.value = encrypted;
    }
    current.signal.throwIfAborted();
    const result = withComment
      ? await resolveMentionWithComment(row.id, operation.value!, current.signal)
      : await setMentionState(row.id, !row.done, current.signal);
    if (current.signal.aborted || !unlocked.value) return;
    rows.value = rows.value.map((entry) => entry.id === row.id ? { ...entry, done: result.done } : entry);
    status.value = t(result.done ? "mentions.markedDone" : "mentions.reopened");
    if (withComment) closeDialog();
    pending.value.delete(row.id);
    await nextTick();
    container.value?.querySelector<HTMLButtonElement>(
      `[data-mention-group="${result.done ? "done" : "open"}"] [data-mention-id="${row.id}"] button`,
    )?.focus();
  } catch (cause) {
    if (current.signal.aborted || !unlocked.value) return;
    if (classifyMeetingFailure(cause) === "access") {
      protectedText.lock("authorization-loss");
      return;
    }
    const code = (cause as { code?: string })?.code;
    if (code === "MENTION_STALE" || code === "MENTION_ALREADY_DONE") {
      closeDialog();
      actionError.value = t(code === "MENTION_STALE" ? "mentions.stale" : "mentions.alreadyDone");
      await load(current);
    } else {
      actionError.value = t("mentions.actionFailed");
    }
  } finally {
    if (!current.signal.aborted) pending.value.delete(row.id);
  }
}

onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section ref="container" class="page">
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
    <template v-else>
      <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <Message v-if="error" severity="error" role="alert">
        {{ t(`mentions.${error}`) }}
        <Button :label="t('mentions.retry')" size="small" @click="retryLoad" />
      </Message>
      <Message v-if="actionError && !selected" severity="error" role="alert">
        {{ actionError }}
      </Message>
      <p v-if="loading" role="status">{{ t("mentions.loading") }}</p>
      <section
        v-for="group in groups"
        :key="group.key"
        class="mention-group"
        :data-mention-group="group.key"
        :aria-labelledby="`mentions-${group.key}`"
      >
        <h2 :id="`mentions-${group.key}`">{{ t(`mentions.${group.key}`) }}</h2>
        <TransitionGroup name="mention" tag="ul" class="mention-list">
          <li
            v-for="row in group.rows"
            :key="row.id"
            :data-mention-id="row.id"
            class="mention-row"
            :aria-busy="pending.has(row.id)"
          >
            <div class="mention-content">
              <RouterLink class="topic-link" :to="`/topics/${row.topicId}`">
                {{ row.topicName }}
              </RouterLink>
              <p class="context">{{ row.context }}</p>
              <RouterLink class="meeting-link" :to="`/meetings/${row.meetingId}`">
                {{ row.meetingTitle }} {{ formatDate(row.date) }}
              </RouterLink>
            </div>
            <div class="row-actions" @click.stop>
              <Button
                v-tooltip="t(row.done ? 'mentions.reopen' : 'mentions.markDone')"
                :aria-label="t(row.done ? 'mentions.reopen' : 'mentions.markDone')"
                :icon="row.done ? 'pi pi-undo' : 'pi pi-check'"
                :disabled="pending.has(row.id)"
                size="small"
                severity="secondary"
                @click="changeState(row)"
              />
              <span
                v-if="!row.done"
                v-tooltip="t(canComment ? 'mentions.doneAndComment' : 'mentions.commentDenied')"
                :tabindex="canComment ? undefined : 0"
                :aria-label="canComment ? undefined : t('mentions.commentDenied')"
              >
                <Button
                  :aria-label="t('mentions.doneAndComment')"
                  :disabled="pending.has(row.id) || !canComment"
                  size="small"
                  severity="secondary"
                  @click="openComment(row)"
                >
                  <i class="pi pi-check-square" aria-hidden="true" />
                  <i class="pi pi-comments" aria-hidden="true" />
                </Button>
              </span>
            </div>
          </li>
        </TransitionGroup>
        <p v-if="!loading && !group.rows.length" role="status">
          {{ t(`mentions.empty${group.key === 'open' ? 'Open' : 'Done'}`) }}
        </p>
      </section>
      <Dialog
        v-model:visible="dialogVisible"
        :header="t('mentions.doneAndComment')"
        modal
        :closable="!selected || !pending.has(selected.id)"
        :close-on-escape="!selected || !pending.has(selected.id)"
        :style="{ width: '36rem', maxWidth: '95vw' }"
      >
        <template v-if="selected">
          <h3>{{ selected.topicName }}</h3>
          <p class="context">{{ selected.context }}</p>
          <Message v-if="actionError" severity="error" role="alert">{{ actionError }}</Message>
          <RichTextEditor
            v-model="draft"
            :aria-label="t('mentions.comment')"
            :readonly="pending.has(selected.id) || Boolean(operation)"
            :placeholder="t('mentions.comment')"
          />
          <p v-if="operation">{{ t("mentions.retryComment") }}</p>
        </template>
        <template #footer>
          <Button
            :label="t('common.cancel')"
            :disabled="Boolean(selected && pending.has(selected.id))"
            severity="secondary"
            @click="closeDialog"
          />
          <Button
            :label="t('common.save')"
            :loading="Boolean(selected && pending.has(selected.id))"
            :disabled="!selected || pending.has(selected.id) || !hasMeaningfulRichText(draft)"
            @click="selected && changeState(selected, true)"
          />
        </template>
      </Dialog>
    </template>
  </section>
</template>

<style scoped>
.page {
  max-width: 1250px;
  margin: 0 auto;
}

.page-header {
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

h2 {
  font-size: 1rem;
}

.mention-group {
  margin-bottom: 1.5rem;
}

.mention-list {
  position: relative;
  list-style: none;
  padding: 0;
  margin: 0;
}

.mention-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border: 1px solid #e2e6ec;
  border-radius: 0.8rem;
  background: #fff;
}

.mention-content {
  min-width: 0;
}

.topic-link,
.meeting-link {
  color: #607dae;
  text-decoration: none;
}

.context {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.row-actions,
.unlock-prompt {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.row-actions {
  flex-shrink: 0;
}

.unlock-prompt {
  flex-wrap: wrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.mention-enter-active,
.mention-leave-active,
.mention-move {
  transition: opacity 160ms ease, transform 160ms ease;
}

.mention-enter-from,
.mention-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}

.mention-leave-active {
  position: absolute;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .mention-enter-active,
  .mention-leave-active,
  .mention-move {
    transition: none;
  }
}

@media (max-width: 650px) {
  .mention-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .row-actions {
    align-self: flex-end;
  }
}
</style>
