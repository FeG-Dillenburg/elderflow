<script lang="ts" setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <p class="security-boundary">
    <i class="pi pi-info-circle" aria-hidden="true" />
    {{ t("protectedPrototype.boundary") }}
  </p>
</template>
