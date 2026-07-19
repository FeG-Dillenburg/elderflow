<script setup lang="ts">
import DOMPurify from "dompurify";
import type { Topic } from "../../api/domain";
import { useI18n } from "vue-i18n";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
const safe = (html: string | null) => DOMPurify.sanitize(html ?? "");
</script>

<template>
  <section>
    <h2>{{ t("topicDetail.background") }}</h2>
    <div v-html="safe(topic.description)" />
  </section>
</template>
