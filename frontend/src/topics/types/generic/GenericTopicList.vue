<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
</script>

<template>
  <div>
    <RouterLink class="primary-link" :to="`/topics/${topic.id}`">
      {{ topic.name }}
    </RouterLink>
    <small>
      {{ topic.defaultSection?.name || t("topics.noDefaultSection") }}
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
