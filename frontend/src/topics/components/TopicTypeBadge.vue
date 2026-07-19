<script setup lang="ts">
import Tag from "primevue/tag";
import { useI18n } from "vue-i18n";
import { topicTypeTranslationKey } from "../topicTypes";

defineProps<{ type: string }>();
const { t } = useI18n();
</script>

<template>
  <Tag :value="t(topicTypeTranslationKey(type))" severity="secondary" />
</template>
