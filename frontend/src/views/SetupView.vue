<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
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
import { createInitialKeyState, type GeneratedInitialKeyState } from "../e2ee/crypto";

type Stage =
  | "loading"
  | "password"
  | "user"
  | "recovery"
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
  sharedPassphrase: "",
  sharedPassphraseConfirmation: "",
});
const submitting = ref(false);
const errorMessage = ref("");
const generatedKeyState = ref<GeneratedInitialKeyState | null>(null);
const firstCopyAcknowledged = ref(false);
const secondCopyAcknowledged = ref(false);
let kdfAbort: AbortController | null = null;
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

async function prepareRecovery(): Promise<void> {
  errorMessage.value = "";
  if (form.password !== form.passwordConfirmation) {
    errorMessage.value = t("setup.passwordsMismatch");
    return;
  }
  if (form.sharedPassphrase !== form.sharedPassphraseConfirmation) {
    errorMessage.value = t("e2ee.passphrasesMismatch");
    return;
  }

  submitting.value = true;
  kdfAbort?.abort();
  kdfAbort = new AbortController();
  try {
    generatedKeyState.value = await createInitialKeyState(form.sharedPassphrase, kdfAbort.signal);
    form.sharedPassphrase = "";
    form.sharedPassphraseConfirmation = "";
    stage.value = "recovery";
  } catch {
    errorMessage.value = t("e2ee.setupFailed");
  } finally {
    kdfAbort = null;
    submitting.value = false;
  }
}

onBeforeUnmount(() => {
  kdfAbort?.abort();
  kdfAbort = null;
});

async function createUser(): Promise<void> {
  if (!generatedKeyState.value || !firstCopyAcknowledged.value || !secondCopyAcknowledged.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    await api.createInitialUser({
      setupPassword: setupPassword.value,
      defaultLanguage: defaultLanguage.value,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      password: form.password,
      e2ee: generatedKeyState.value.e2ee,
    });
    generatedKeyState.value = null;
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

function printRecovery(): void {
  window.print();
}
</script>

<template>
  <main class="setup-page">
    <section class="setup-card">
      <img
        class="brand-wordmark"
        src="/elderflow-wordmark-color.png"
        :alt="t('brand.name')"
      />
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
        <p v-else-if="stage === 'recovery'" class="description">
          {{ t("e2ee.recoverySetupDescription") }}
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
          @submit.prevent="prepareRecovery"
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
          <label>
            <span>{{ t("e2ee.sharedPassphrase") }}</span>
            <Password
              v-model="form.sharedPassphrase"
              toggle-mask
              autocomplete="new-password"
              minlength="12"
              required
            />
          </label>
          <label>
            <span>{{ t("e2ee.confirmSharedPassphrase") }}</span>
            <Password
              v-model="form.sharedPassphraseConfirmation"
              :feedback="false"
              toggle-mask
              autocomplete="new-password"
              minlength="12"
              required
            />
          </label>
          <Button
            :label="t('e2ee.createRecoverySecret')"
            type="submit"
            :loading="submitting"
          />
        </form>

        <form
          v-else-if="stage === 'recovery' && generatedKeyState"
          class="setup-form recovery-form"
          @submit.prevent="createUser"
        >
          <p class="recovery-warning">{{ t("e2ee.recoveryWarning") }}</p>
          <code class="recovery-secret" aria-live="polite">
            {{ generatedKeyState.recoveryText }}
          </code>
          <Button
            type="button"
            severity="secondary"
            :label="t('e2ee.printRecoverySecret')"
            @click="printRecovery"
          />
          <label class="acknowledgement">
            <input v-model="firstCopyAcknowledged" type="checkbox" />
            <span>{{ t("e2ee.firstCopyAcknowledgement") }}</span>
          </label>
          <label class="acknowledgement">
            <input v-model="secondCopyAcknowledged" type="checkbox" />
            <span>{{ t("e2ee.secondCopyAcknowledgement") }}</span>
          </label>
          <Button
            :label="t('setup.createSuperadmin')"
            type="submit"
            :loading="submitting"
            :disabled="!firstCopyAcknowledged || !secondCopyAcknowledged"
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

.setup-form,
.setup-form label {
  display: grid;
  gap: 0.45rem;
}

.recovery-warning {
  color: #9a3412;
  font-weight: 700;
}

.recovery-secret {
  overflow-wrap: anywhere;
  padding: 1rem;
  border: 1px dashed #64748b;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.acknowledgement {
  grid-template-columns: auto 1fr;
  align-items: start;
}

@media print {
  .setup-card > :not(.recovery-form),
  .recovery-form > :not(.recovery-secret) {
    display: none;
  }
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
