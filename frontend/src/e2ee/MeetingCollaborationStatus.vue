<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { meetingCollaboration, type CollaborationStatus } from "./meeting-collaboration";

const props = defineProps<{ meetingId: string }>();
const { t } = useI18n();
const provider = meetingCollaboration.get(props.meetingId);
const status = ref<CollaborationStatus>(provider?.status ?? "offline");
const changed = (event: Event) => { status.value = (event as CustomEvent<CollaborationStatus>).detail; };
onMounted(() => provider?.addEventListener("status", changed));
onBeforeUnmount(() => provider?.removeEventListener("status", changed));
</script>

<template>
  <p class="collaboration-status" :class="status" role="status" aria-live="polite">
    <i class="pi" :class="status === 'online' ? 'pi-wifi' : status === 'pending' ? 'pi-clock' : 'pi-exclamation-triangle'" />
    {{ t(`e2ee.collaboration.${status}`) }}
  </p>
</template>

<style scoped>
.collaboration-status { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.8rem; color: #526176; font-size: 0.85rem; }
.collaboration-status.rejected, .collaboration-status.discarded { color: #9f261f; font-weight: 700; }
</style>
