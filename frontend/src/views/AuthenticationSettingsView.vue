<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import Select from "primevue/select";
import Tag from "primevue/tag";
import {
  externalAuthApi,
  type ExternalLinkedUser,
  type ExternalProviderSettings,
  type ExternalProviderType,
} from "../api/external-auth";

const { t } = useI18n();
const route = useRoute();
const provider = ref<ExternalProviderSettings | null>(null);
const users = ref<ExternalLinkedUser[]>([]);
const loading = ref(true);
const saving = ref(false);
const actionLoading = ref(false);
const message = ref("");
const errorMessage = ref("");
const form = reactive({
  type: "oidc" as ExternalProviderType,
  displayLabel: "",
  issuerUrl: "",
  churchToolsUrl: "",
  clientId: "",
  publicBaseUrl: typeof window === "undefined" ? "" : window.location.origin,
  clientSecret: "",
  removeClientSecret: false,
});

const providerTypes = computed(() => [
  { label: t("externalAuth.oidc"), value: "oidc" },
  { label: t("externalAuth.churchTools"), value: "churchtools" },
]);
const statusLabel = computed(() => provider.value ? t(`externalAuth.status.${provider.value.status}`) : t("externalAuth.status.notConfigured"));

function applySettings(settings: ExternalProviderSettings | null): void {
  provider.value = settings;
  if (!settings) return;
  form.type = settings.type;
  form.displayLabel = settings.displayLabel;
  form.issuerUrl = settings.issuerUrl ?? "";
  form.churchToolsUrl = settings.churchToolsUrl ?? "";
  form.clientId = settings.clientId ?? "";
  form.publicBaseUrl = settings.publicBaseUrl ?? window.location.origin;
  form.clientSecret = "";
  form.removeClientSecret = false;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const settings = await externalAuthApi.settings();
    applySettings(settings);
    users.value = settings ? await externalAuthApi.users() : [];
    const testId = typeof route.query.test === "string" ? route.query.test : null;
    if (testId) {
      const result = await externalAuthApi.testResult(testId);
      message.value = result.code ? t(`externalAuth.diagnostics.${result.code}`) : "";
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("externalAuth.loadFailed");
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    applySettings(await externalAuthApi.save({
      type: form.type,
      displayLabel: form.displayLabel,
      issuerUrl: form.type === "oidc" ? form.issuerUrl || null : null,
      churchToolsUrl: form.type === "churchtools" ? form.churchToolsUrl || null : null,
      clientId: form.clientId || null,
      publicBaseUrl: form.publicBaseUrl || null,
      clientSecret: form.type === "oidc" && form.clientSecret ? form.clientSecret : undefined,
      removeClientSecret: form.type === "oidc" && form.removeClientSecret,
    }));
    message.value = t("externalAuth.saved");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("externalAuth.saveFailed");
  } finally {
    saving.value = false;
  }
}

async function startTest(): Promise<void> {
  actionLoading.value = true;
  try {
    const result = await externalAuthApi.startTest();
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("externalAuth.testFailed");
    actionLoading.value = false;
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  actionLoading.value = true;
  try {
    applySettings(await (enabled ? externalAuthApi.enable() : externalAuthApi.disable()));
    message.value = t(enabled ? "externalAuth.enabled" : "externalAuth.disabled");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("externalAuth.saveFailed");
  } finally {
    actionLoading.value = false;
  }
}

async function removeProvider(): Promise<void> {
  if (!window.confirm(t("externalAuth.removeConfirm"))) return;
  actionLoading.value = true;
  try {
    await externalAuthApi.remove();
    applySettings(null);
    users.value = [];
    Object.assign(form, { type: "oidc", displayLabel: "", issuerUrl: "", churchToolsUrl: "", clientId: "", publicBaseUrl: window.location.origin, clientSecret: "", removeClientSecret: false });
    message.value = t("externalAuth.removed");
  } finally {
    actionLoading.value = false;
  }
}

async function copyCallback(): Promise<void> {
  if (provider.value?.callbackUrl) {
    await navigator.clipboard.writeText(provider.value.callbackUrl);
    message.value = t("externalAuth.callbackCopied");
  }
}

async function resetLink(user: ExternalLinkedUser): Promise<void> {
  if (!window.confirm(t("externalAuth.resetConfirm", { name: `${user.firstName} ${user.lastName}` }))) return;
  await externalAuthApi.resetLink(user.id);
  user.linked = false;
  message.value = t("externalAuth.linkReset");
}

onMounted(load);
</script>

<template>
  <section class="settings-page">
    <header>
      <div>
        <h1>{{ t("externalAuth.settingsTitle") }}</h1>
        <p>{{ t("externalAuth.settingsDescription") }}</p>
      </div>
      <Tag :value="statusLabel" :severity="provider?.enabled ? 'success' : 'secondary'" />
    </header>

    <Message v-if="message" severity="success" :closable="false">{{ message }}</Message>
    <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
    <Message v-if="provider?.diagnosticCode" severity="warn" :closable="false">
      {{ t(`externalAuth.diagnostics.${provider.diagnosticCode}`) }}
    </Message>

    <form v-if="!loading" class="provider-form" @submit.prevent="save">
      <label>
        <span>{{ t("externalAuth.providerType") }}</span>
        <Select v-model="form.type" :options="providerTypes" option-label="label" option-value="value" :disabled="Boolean(provider)" />
      </label>
      <label>
        <span>{{ t("externalAuth.displayLabel") }}</span>
        <InputText v-model="form.displayLabel" required />
      </label>
      <label v-if="form.type === 'oidc'">
        <span>{{ t("externalAuth.issuerUrl") }}</span>
        <InputText v-model="form.issuerUrl" type="url" :disabled="Boolean(provider?.issuerUrl)" />
      </label>
      <label v-else>
        <span>{{ t("externalAuth.churchToolsUrl") }}</span>
        <InputText v-model="form.churchToolsUrl" type="url" :disabled="Boolean(provider?.churchToolsUrl)" />
      </label>
      <label>
        <span>{{ t("externalAuth.clientId") }}</span>
        <InputText v-model="form.clientId" :disabled="Boolean(provider?.clientId)" />
      </label>
      <label v-if="form.type === 'oidc'">
        <span>{{ provider?.clientSecretConfigured ? t("externalAuth.replaceClientSecret") : t("externalAuth.clientSecret") }}</span>
        <Password v-model="form.clientSecret" :feedback="false" toggle-mask autocomplete="new-password" />
      </label>
      <label v-if="form.type === 'oidc' && provider?.clientSecretConfigured" class="check-label">
        <Checkbox v-model="form.removeClientSecret" binary input-id="remove-client-secret" />
        <span>{{ t("externalAuth.removeClientSecret") }}</span>
      </label>
      <label>
        <span>{{ t("externalAuth.publicBaseUrl") }}</span>
        <InputText v-model="form.publicBaseUrl" type="url" />
        <small>{{ t("externalAuth.publicBaseUrlHelp") }}</small>
      </label>
      <label v-if="provider?.callbackUrl">
        <span>{{ t("externalAuth.callbackUrl") }}</span>
        <span class="callback-row">
          <InputText :model-value="provider.callbackUrl" readonly />
          <Button type="button" icon="pi pi-copy" :label="t('externalAuth.copyCallback')" severity="secondary" @click="copyCallback" />
        </span>
      </label>
      <div class="actions">
        <Button type="submit" :label="t('common.save')" :loading="saving" />
        <Button v-if="provider" type="button" :label="t('externalAuth.testLogin')" severity="secondary" :loading="actionLoading" @click="startTest" />
        <Button v-if="provider && !provider.enabled" type="button" :label="t('externalAuth.enable')" :disabled="!provider.canEnable" :loading="actionLoading" @click="setEnabled(true)" />
        <Button v-if="provider?.enabled" type="button" :label="t('externalAuth.disable')" severity="secondary" :loading="actionLoading" @click="setEnabled(false)" />
        <Button v-if="provider" type="button" :label="t('externalAuth.remove')" severity="danger" :loading="actionLoading" @click="removeProvider" />
      </div>
    </form>

    <section v-if="provider" class="linked-users">
      <h2>{{ t("externalAuth.linkedUsers") }}</h2>
      <p v-if="!users.length">{{ t("externalAuth.noUsers") }}</p>
      <table v-else>
        <thead><tr><th>{{ t("common.user") }}</th><th>{{ t("common.email") }}</th><th>{{ t("common.status") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.firstName }} {{ user.lastName }}</td>
            <td>{{ user.email }}</td>
            <td>{{ t(user.linked ? "externalAuth.linked" : "externalAuth.unlinked") }}</td>
            <td><Button v-if="user.linked" type="button" :label="t('externalAuth.resetLink')" severity="secondary" size="small" @click="resetLink(user)" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.settings-page { display: grid; max-width: 60rem; gap: 1rem; padding: 2rem; }
header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
h1, h2, p { margin-top: 0; }
.provider-form { display: grid; gap: 1rem; padding: 1.5rem; border: 1px solid #dbe2ea; border-radius: 0.75rem; background: #fff; }
.provider-form label { display: grid; gap: 0.4rem; font-weight: 600; }
.provider-form small { color: #64748b; font-weight: 400; }
.check-label { grid-template-columns: auto 1fr; align-items: center; }
.callback-row, .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.callback-row :deep(input) { min-width: min(30rem, 70vw); }
.linked-users { padding: 1.5rem; border: 1px solid #dbe2ea; border-radius: 0.75rem; background: #fff; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
</style>
