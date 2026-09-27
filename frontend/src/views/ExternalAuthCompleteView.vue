<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { safeReturnPath } from "../auth/return-path";
import { auth } from "../auth/auth";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const failed = ref(false);

onMounted(async () => {
  const code = typeof route.query.code === "string" ? route.query.code : "";
  try {
    await auth.completeExternal(code);
    await router.replace(safeReturnPath(route.query.return));
  } catch {
    failed.value = true;
    await router.replace({ path: "/login", query: { externalError: "AUTH_EXTERNAL_LOGIN_FAILED" } });
  }
});
</script>

<template>
  <main class="completion-page">
    <ProgressSpinner v-if="!failed" :aria-label="t('externalAuth.completing')" />
    <Message v-else severity="error" :closable="false">
      {{ t("externalAuth.loginFailed") }}
    </Message>
  </main>
</template>

<style scoped>
.completion-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
}
</style>
