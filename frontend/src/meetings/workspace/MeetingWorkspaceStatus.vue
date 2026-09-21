<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import Message from "primevue/message";
import { closePromptKey } from "./close-prompt";
import CollaboratorAvatar from "../../components/CollaboratorAvatar.vue";
import type { MeetingWorkspacePhase } from "./core";
import MeetingWorkspaceSyncActivity from "./MeetingWorkspaceSyncActivity.vue";
import { useMeetingWorkspace } from "./vue";

const workspace = useMeetingWorkspace();
const closePrompt = inject(closePromptKey, null);
const { t } = useI18n();
const phase = computed(() => workspace.state.phase);
const pendingChanges = computed(() => workspace.state.pendingChanges);
const syncActivity = computed(() => workspace.state.syncActivity);
const collaborators = computed(() => workspace.state.collaborators);
const displayedPhase = computed(() => phase.value === "syncing" ? "ready" : phase.value);
const syncActivitySuppressed = computed(() =>
  phase.value !== "ready" && phase.value !== "syncing",
);
const iconPhase = ref<MeetingWorkspacePhase>(
  phase.value === "syncing" ? "ready" : phase.value,
);
let syncingIconTimer: ReturnType<typeof setTimeout> | undefined;

watch(phase, (nextPhase) => {
  if (syncingIconTimer !== undefined) clearTimeout(syncingIconTimer);
  syncingIconTimer = undefined;
  if (nextPhase === "syncing") {
    syncingIconTimer = setTimeout(() => {
      iconPhase.value = "syncing";
      syncingIconTimer = undefined;
    }, 1_000);
    return;
  }
  iconPhase.value = nextPhase;
});

onBeforeUnmount(() => {
  if (syncingIconTimer !== undefined) clearTimeout(syncingIconTimer);
});

const iconForPhase: Record<MeetingWorkspacePhase, string> = {
  opening: "pi-clock",
  locked: "pi-lock",
  ready: "pi-wifi",
  temporarily_offline: "pi-exclamation-triangle",
  syncing: "pi-clock",
  unavailable: "pi-exclamation-triangle",
  closed: "pi-times",
};
</script>

<template>
  <Dialog
    :visible="closePrompt?.visible.value ?? false"
    modal
    :closable="false"
    :header="t('meetingWorkspace.closeTitle')"
  >
    <p>{{ t("meetingWorkspace.closeDescription") }}</p>
    <template #footer>
      <Button
        :label="t('meetingWorkspace.stay')"
        @click="closePrompt?.answer(false)"
      />
      <Button
        severity="danger"
        :label="t('meetingWorkspace.discard')"
        @click="closePrompt?.answer(true)"
      />
    </template>
  </Dialog>
  <Message
    v-if="workspace.state.notice"
    :key="workspace.state.notice"
    :severity="workspace.state.notice === 'completed_elsewhere' ? 'success' : 'warn'"
    closable
    :close-button-props="{ 'aria-label': t('meetingWorkspace.dismissNotice') }"
    @close="workspace.dismissNotice()"
  >
    {{ t(`meetingWorkspace.notices.${workspace.state.notice}`) }}
  </Message>
  <Button
    v-if="phase === 'unavailable'"
    class="workspace-retry"
    :label="t('meetingWorkspace.retry')"
    @click="workspace.open().catch(() => undefined)"
  />
  <Teleport to="#meeting-workspace-status">
    <div class="meeting-workspace-status">
      <p
        class="workspace-phase"
        :class="`phase-${phase}`"
        role="status"
        aria-live="polite"
      >
        <i class="pi" :class="iconForPhase[iconPhase]" aria-hidden="true" />
        <span>{{ t(`meetingWorkspace.phases.${displayedPhase}`) }}</span>
        <span v-if="pendingChanges" class="visually-hidden">
          {{ t("meetingWorkspace.syncActivity") }}
        </span>
      </p>
      <div class="workspace-status-detail">
        <MeetingWorkspaceSyncActivity
          :activity="syncActivity"
          :suppressed="syncActivitySuppressed"
        />
        <div
          v-if="collaborators.length"
          class="workspace-collaborators"
          role="list"
          :aria-label="t('editor.liveCollaborators')"
        >
          <CollaboratorAvatar
            v-for="collaborator in collaborators"
            :key="collaborator.id"
            :collaborator="collaborator"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-retry {
  margin-block: 0.75rem;
}

.meeting-workspace-status {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
}

.workspace-phase {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  color: #526176;
  font-size: 0.85rem;
}

.workspace-phase.phase-temporarily_offline {
  color: #9a5800;
  font-weight: 700;
}

.workspace-phase.phase-unavailable {
  color: #9f261f;
  font-weight: 700;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.workspace-status-detail {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.workspace-collaborators {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
</style>
