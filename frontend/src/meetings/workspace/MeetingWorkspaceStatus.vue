<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import CollaboratorAvatar from "../../components/CollaboratorAvatar.vue";
import type { MeetingWorkspacePhase } from "./core";
import { useMeetingWorkspace } from "./vue";

const workspace = useMeetingWorkspace();
const { t } = useI18n();
const phase = computed(() => workspace.state.phase);
const pendingChanges = computed(() => workspace.state.pendingChanges);
const collaborators = computed(() => workspace.state.collaborators);
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
  <Teleport to="#meeting-workspace-status">
    <div class="meeting-workspace-status">
      <p
        class="workspace-phase"
        :class="`phase-${phase}`"
        role="status"
        aria-live="polite"
      >
        <i class="pi" :class="iconForPhase[phase]" aria-hidden="true" />
        <span>{{ t(`meetingWorkspace.phases.${phase}`) }}</span>
        <span v-if="pendingChanges" class="pending-changes">
          · {{ t("meetingWorkspace.pendingChanges") }}
        </span>
      </p>
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
  </Teleport>
</template>

<style scoped>
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

.workspace-phase.phase-unavailable {
  color: #9f261f;
  font-weight: 700;
}

.workspace-collaborators {
  display: flex;
  align-items: center;
}

.workspace-collaborators :deep(.collaborator-avatar) + :deep(.collaborator-avatar) {
  margin-left: -0.45rem;
}
</style>
