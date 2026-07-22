<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import type { Topic } from "../../../api/domain";
import { formatDate } from "../../../i18n";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
</script>

<template>
  <div>
    <RouterLink class="primary-link" :to="`/topics/${topic.id}`">
      {{ topic.name }}
    </RouterLink>
    <small>
      {{ t("recurringTopic.every", {
        count: topic.recurrenceInterval,
        unit: t(`recurringTopic.${topic.recurrenceUnit}`),
      }) }}
      · {{ t("recurringTopic.nextDue", {
        date: topic.nextDueDate
          ? formatDate(`${topic.nextDueDate}T12:00:00`)
          : t("common.none"),
      }) }}
    </small>
  </div>
</template>

<style scoped>
.primary-link {
  display: block;
  font-weight: 700;
  text-decoration: none;
}

small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
}
</style>
