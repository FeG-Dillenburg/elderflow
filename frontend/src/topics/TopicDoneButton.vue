<script setup lang="ts">
import Button from "primevue/button";
import { useI18n } from "vue-i18n";

defineProps<{
  done: boolean;
  size?: "small" | "large";
}>();
defineEmits<{ toggle: [] }>();

const { t } = useI18n();
</script>

<template>
  <Button
    :aria-pressed="done"
    :icon="done ? 'pi pi-check' : undefined"
    :label="done ? t('meetingAgenda.markedDone') : t('meetingAgenda.markDone')"
    severity="success"
    text
    :size="size"
    @click="$emit('toggle')"
  />
</template>
