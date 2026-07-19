<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import Select from "primevue/select";
import { api } from "../api/domain";
import {
  detectSupportedLanguage,
  type SupportedLanguage,
} from "../i18n/language";
import { setLanguage } from "../i18n";
import { installation } from "../installation";

type Stage =
  | "loading"
  | "password"
  | "user"
  | "complete"
  | "already-setup"
  | "error";

const stage = ref<Stage>("loading");
const setupPassword = ref("");
const form = reactive({
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  passwordConfirmation: "",
});
const submitting = ref(false);
const errorMessage = ref("");
const defaultLanguage = ref<SupportedLanguage>(
  detectSupportedLanguage(navigator.languages) ?? "en",
);
const { t } = useI18n();
const languageOptions = computed(() => [
  { label: t("languages.en"), value: "en" },
  { label: t("languages.de"), value: "de" },
]);

watch(defaultLanguage, setLanguage, { immediate: true });

onMounted(async () => {
  try {
    const status = await api.installation();
    stage.value = status.setupRequired ? "password" : "already-setup";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("setup.checkFailed");
    stage.value = "error";
  }
});

async function verifyPassword(): Promise<void> {
  submitting.value = true;
  errorMessage.value = "";
  try {
    await api.verifySetupPassword(setupPassword.value);
    stage.value = "user";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("setup.verifyFailed");
  } finally {
    submitting.value = false;
  }
}

async function createUser(): Promise<void> {
  errorMessage.value = "";
  if (form.password !== form.passwordConfirmation) {
    errorMessage.value = t("setup.passwordsMismatch");
    return;
  }

  submitting.value = true;
  try {
    await api.createInitialUser({
      setupPassword: setupPassword.value,
      defaultLanguage: defaultLanguage.value,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      password: form.password,
    });
    installation.setupRequired = false;
    installation.defaultLanguage = defaultLanguage.value;
    stage.value = "complete";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("setup.createFailed");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="setup-page">
    <section class="setup-card">
      <div class="brand-mark">E</div>
      <p class="eyebrow">ElderFlow</p>
      <h1>{{ t("setup.title") }}</h1>

      <label
        v-if="stage !== 'already-setup' && stage !== 'complete'"
        class="language-field"
      >
        <span>{{ t("setup.defaultLanguage") }}</span>
        <Select
          v-model="defaultLanguage"
          :options="languageOptions"
          option-label="label"
          option-value="value"
        />
      </label>

      <p v-if="stage === 'loading'" class="description">
        {{ t("setup.checking") }}
      </p>

      <template v-else-if="stage === 'already-setup'">
        <Message class="result-message" severity="info" :closable="false">
          {{ t("setup.already") }}
        </Message>
        <RouterLink class="login-link" to="/login">
          {{ t("setup.goToSignIn") }}
        </RouterLink>
      </template>

      <template v-else-if="stage === 'complete'">
        <Message class="result-message" severity="success" :closable="false">
          {{ t("setup.complete") }}
        </Message>
        <RouterLink class="login-link" to="/login">
          {{ t("setup.signIn") }}
        </RouterLink>
      </template>

      <template v-else>
        <p v-if="stage === 'password'" class="description">
          {{ t("setup.passwordHelp") }}
        </p>
        <p v-else-if="stage === 'user'" class="description">
          {{ t("setup.userHelp") }}
        </p>
        <Message v-if="errorMessage" severity="error" :closable="false">
          {{ errorMessage }}
        </Message>

        <form
          v-if="stage === 'password'"
          class="setup-form"
          @submit.prevent="verifyPassword"
        >
          <label>
            <span>{{ t("setup.setupPassword") }}</span>
            <Password
              v-model="setupPassword"
              :feedback="false"
              toggle-mask
              autocomplete="off"
              required
              autofocus
            />
          </label>
          <Button
            :label="t('common.continue')"
            type="submit"
            :loading="submitting"
          />
        </form>

        <form
          v-else-if="stage === 'user'"
          class="setup-form"
          @submit.prevent="createUser"
        >
          <label>
            <span>{{ t("setup.firstName") }}</span>
            <InputText
              v-model="form.firstName"
              autocomplete="given-name"
              maxlength="100"
              required
              autofocus
            />
          </label>
          <label>
            <span>{{ t("setup.lastName") }}</span>
            <InputText
              v-model="form.lastName"
              autocomplete="family-name"
              maxlength="100"
              required
            />
          </label>
          <label>
            <span>{{ t("common.email") }}</span>
            <InputText
              v-model="form.email"
              type="email"
              autocomplete="username"
              maxlength="320"
              required
            />
          </label>
          <label>
            <span>{{ t("common.password") }}</span>
            <Password
              v-model="form.password"
              toggle-mask
              autocomplete="new-password"
              minlength="10"
              maxlength="200"
              required
            />
          </label>
          <label>
            <span>{{ t("setup.confirmPassword") }}</span>
            <Password
              v-model="form.passwordConfirmation"
              :feedback="false"
              toggle-mask
              autocomplete="new-password"
              minlength="10"
              maxlength="200"
              required
            />
          </label>
          <Button
            :label="t('setup.createSuperadmin')"
            type="submit"
            :loading="submitting"
          />
        </form>
      </template>
    </section>
  </main>
</template>

<style scoped>
.setup-page {
  display: grid;
  min-height: 100vh;
  padding: 1rem;
  place-items: center;
  background: #eef2f7;
}

.setup-card {
  width: min(32rem, 100%);
  padding: 2.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 24px 60px rgb(15 23 42 / 10%);
}

.brand-mark {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  border-radius: 0.75rem;
  background: #315a9b;
  color: #fff;
  font-weight: 800;
}

.eyebrow {
  margin: 1.25rem 0 0.35rem;
  color: #5572a7;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: #1e293b;
}

.description {
  margin: 0.5rem 0 1.5rem;
  color: #64748b;
}

.setup-form,
.setup-form label {
  display: grid;
  gap: 0.45rem;
}

.language-field {
  display: grid;
  gap: 0.45rem;
  margin: 1rem 0;
  color: #334155;
  font-size: 0.9rem;
  font-weight: 600;
}

.setup-form {
  gap: 1rem;
  margin-top: 1rem;
}

.setup-form label {
  color: #334155;
  font-size: 0.9rem;
  font-weight: 600;
}

.login-link {
  display: inline-block;
  margin-top: 1.25rem;
  color: #315a9b;
  font-weight: 700;
}

.result-message {
  margin-top: 1rem;
}

:deep(input),
:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}
</style>
