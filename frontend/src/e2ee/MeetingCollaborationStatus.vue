<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { meetingCollaboration, type CollaborationStatus } from "./meeting-collaboration";

const props = defineProps<{ meetingId: string }>();
const { t } = useI18n();
const provider = ref<ReturnType<typeof meetingCollaboration.get>>();
const status = ref<CollaborationStatus>("offline");
const changed = (event: Event) => {
  status.value = (event as CustomEvent<CollaborationStatus>).detail;
};
const connect = () => {
  provider.value?.removeEventListener("status", changed);
  provider.value = meetingCollaboration.get(props.meetingId);
  status.value = provider.value?.status ?? "offline";
  provider.value?.addEventListener("status", changed);
};
const providerStarted = (event: Event) => {
  if ((event as CustomEvent<string>).detail === props.meetingId) connect();
};
onMounted(() => {
  connect();
  window.addEventListener("elderflow:meeting-collaboration-started", providerStarted);
});
onBeforeUnmount(() => {
  provider.value?.removeEventListener("status", changed);
  window.removeEventListener("elderflow:meeting-collaboration-started", providerStarted);
});
</script>

<template>
  <p v-if="provider" class="collaboration-status" :class="status" role="status" aria-live="polite">
    <i class="pi" :class="status === 'online' ? 'pi-wifi' : status === 'pending' ? 'pi-clock' : 'pi-exclamation-triangle'" />
    {{ t(`e2ee.collaboration.${status}`) }}
  </p>
</template>

<style scoped>
.collaboration-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.8rem;
  color: #526176;
  font-size: 0.85rem;
}

.collaboration-status.rejected,
.collaboration-status.discarded {
  color: #9f261f;
  font-weight: 700;
}
</style>
