<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import { auth } from "../auth/auth";
import { useI18n } from "vue-i18n";
import Divider from "primevue/divider";
import { externalAuthApi, type PublicExternalProvider } from "../api/external-auth";

const route = useRoute();
const router = useRouter();
const form = reactive({ email: "", password: "" });
const saving = ref(false);
const errorMessage = ref("");
const externalProvider = ref<PublicExternalProvider | null>(null);
const externalLoading = ref(false);
const { t } = useI18n();

onMounted(async () => {
  if (route.query.externalError) errorMessage.value = t("externalAuth.loginFailed");
  try {
    externalProvider.value = await externalAuthApi.publicProvider();
  } catch {
    externalProvider.value = null;
  }
});

async function startExternalLogin(): Promise<void> {
  externalLoading.value = true;
  errorMessage.value = "";
  try {
    const result = await externalAuthApi.startLogin(
      typeof route.query.redirect === "string" ? route.query.redirect : "/",
    );
    window.location.assign(result.authorizationUrl);
  } catch {
    errorMessage.value = t("externalAuth.loginFailed");
    externalLoading.value = false;
  }
}

async function submit(): Promise<void> {
  saving.value = true;
  errorMessage.value = "";
  try {
    await auth.login(form.email, form.password);
    await router.push(
      typeof route.query.redirect === "string" ? route.query.redirect : "/",
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("login.failed");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <img
        class="brand-wordmark"
        src="/elderflow-wordmark-color.png"
        :alt="t('brand.name')"
      />
      <h1>{{ t("login.title") }}</h1>
      <p class="description">{{ t("login.description") }}</p>
      <Message v-if="errorMessage" severity="error" :closable="false">
        {{ errorMessage }}
      </Message>
      <Button
        v-if="externalProvider"
        class="external-login"
        :label="t('externalAuth.signInWith', { provider: externalProvider.displayLabel })"
        icon="pi pi-sign-in"
        :loading="externalLoading"
        @click="startExternalLogin"
      />
      <Divider v-if="externalProvider" align="center">
        {{ t("externalAuth.localSeparator") }}
      </Divider>
      <form class="login-form" @submit.prevent="submit">
        <h2>{{ t("externalAuth.localTitle") }}</h2>
        <label>
          <span>{{ t("common.email") }}</span>
          <InputText
            v-model="form.email"
            type="email"
            autocomplete="username"
            required
            autofocus
          />
        </label>
        <label>
          <span>{{ t("common.password") }}</span>
          <Password
            v-model="form.password"
            :feedback="false"
            toggle-mask
            autocomplete="current-password"
            required
          />
        </label>
        <Button :label="t('login.submit')" type="submit" :loading="saving" />
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: 1rem;
  place-items: center;
  background: #eef2f7;
}
.login-card {
  width: min(28rem, 100%);
  padding: 2.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 24px 60px rgb(15 23 42 / 10%);
}

.brand-wordmark {
  display: block;
  width: 12rem;
  max-width: 100%;
  height: auto;
  margin-bottom: 1.25rem;
}
h1 {
  margin: 0;
  color: #1e293b;
}
.description {
  margin: 0.5rem 0 1.5rem;
  color: #64748b;
}
.login-form,
.login-form label {
  display: grid;
  gap: 0.45rem;
}
.login-form {
  gap: 1rem;
}
.login-form h2 {
  margin: 0;
  color: #334155;
  font-size: 1rem;
}
.external-login {
  width: 100%;
  margin-bottom: 0.5rem;
}
.login-form label {
  color: #334155;
  font-size: 0.9rem;
  font-weight: 600;
}
:deep(input),
:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}
</style>
