<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { auth } from "../auth/auth";
import CollaboratorAvatar from "../components/CollaboratorAvatar.vue";
import {
  isCollaboratorPresentation,
  type CollaboratorPresentation,
} from "./collaborator-presentation";
import { meetingCollaboration } from "./meeting-collaboration";

const props = defineProps<{ meetingId: string }>();
const { t } = useI18n();
const provider = ref<ReturnType<typeof meetingCollaboration.get>>();
const collaborators = ref<CollaboratorPresentation[]>([]);

const refresh = () => {
  const localUserId = auth.state.user?.id;
  const people = new Map<string, CollaboratorPresentation>();
  for (const state of provider.value?.awareness.getStates().values() ?? []) {
    if (isCollaboratorPresentation(state.user) && state.user.id !== localUserId) {
      people.set(state.user.id, state.user);
    }
  }
  collaborators.value = [...people.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
};
const connect = () => {
  provider.value?.awareness.off("change", refresh);
  provider.value = meetingCollaboration.get(props.meetingId);
  provider.value?.awareness.on("change", refresh);
  refresh();
};
const providerStarted = (event: Event) => {
  if ((event as CustomEvent<string>).detail === props.meetingId) connect();
};

onMounted(() => {
  connect();
  window.addEventListener("elderflow:meeting-collaboration-started", providerStarted);
});
onBeforeUnmount(() => {
  provider.value?.awareness.off("change", refresh);
  window.removeEventListener("elderflow:meeting-collaboration-started", providerStarted);
});
</script>

<template>
  <div
    v-if="collaborators.length"
    class="meeting-collaboration-presence"
    role="list"
    :aria-label="t('editor.liveCollaborators')"
  >
    <CollaboratorAvatar
      v-for="collaborator in collaborators"
      :key="collaborator.id"
      :collaborator="collaborator"
    />
  </div>
</template>

<style scoped>
.meeting-collaboration-presence {
  display: flex;
  align-items: center;
}

.meeting-collaboration-presence :deep(.collaborator-avatar) + :deep(.collaborator-avatar) {
  margin-left: -0.45rem;
}
</style>
