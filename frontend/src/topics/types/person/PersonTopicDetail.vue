<script setup lang="ts">
import DOMPurify from "dompurify";
import type { Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
const safe = (html: string | null) => DOMPurify.sanitize(html ?? "");
</script>

<template>
  <section>
    <h2>{{ t("personTopic.descriptionLabel") }}</h2>
    <div v-html="safe(topic.description)" />
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 0.8rem;
  font-size: 1rem;
}

div {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
