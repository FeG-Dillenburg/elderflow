<script setup lang="ts">
import { onUnmounted } from "vue";
import Message from "primevue/message";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { tours } from "./tours";

const { t } = useI18n();
onUnmounted(tours.mount(useRouter()));
</script>

<template>
  <Message v-if="tours.state.transitioning" class="tour-error" role="status">
    {{ t('tours.meetingLoading') }}
  </Message>
  <Message
    v-if="tours.state.error"
    severity="warn"
    role="status"
    class="tour-error"
  >
    {{ t("tours.unavailable") }}
  </Message>
</template>

<style scoped>
.tour-error {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  max-width: min(28rem, calc(100vw - 2rem));
  z-index: 1200;
}
</style>
