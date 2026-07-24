<script lang="ts" setup>
import { useI18n } from "vue-i18n";

defineProps<{
  canRead: boolean;
  showCiphertext: boolean;
  title: string;
  lockedCopy: string;
}>();

defineEmits<{
  blockedEdit: [];
  unlock: [];
}>();

const { t } = useI18n();
</script>

<template>
  <article class="protected-card">
    <header>
      <span class="card-label">{{ title }}</span>
      <span class="protected-tag">
        <i class="pi pi-shield" aria-hidden="true" />
        {{ t("protectedPrototype.protected") }}
      </span>
    </header>
    <template v-if="canRead">
      <h3>{{ t("protectedPrototype.sample.topic") }}</h3>
      <p>{{ t("protectedPrototype.sample.note") }}</p>
      <button class="text-button" type="button">
        {{ t("common.edit") }}
      </button>
    </template>
    <template v-else>
      <div class="locked-placeholder" @click="$emit('blockedEdit')">
        <i class="pi pi-lock" aria-hidden="true" />
        <p>{{ lockedCopy }}</p>
        <code v-if="showCiphertext">v1:5b7f…39ac · nonce:a091…</code>
      </div>
      <button class="text-button" type="button" @click="$emit('unlock')">
        {{ t("protectedPrototype.actions.unlock") }}
      </button>
    </template>
  </article>
</template>
